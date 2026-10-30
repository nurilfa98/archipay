// Kartu satu project di halaman Project. Server Component.
//
//   ┌──────────────────────────────────────┐
//   │ [ikon] Nama project              >   │  klik kartu = detail project
//   │        Klien                         │
//   ├──────────────────────────────────────┤
//   │ Owner   : nilai kontrak + pengeluaran│
//   │ Lainnya : hitungan uang muka         │
//   │ [Uang Muka 3] [Pertanggungjawaban 1] │  badge = langsung ke daftar
//   │                            (Aktif)   │  status project (informasi saja)
//   └──────────────────────────────────────┘
//
// Seluruh kartu bisa diklik lewat link nama project yang direntangkan
// (after:absolute inset-0). Badge diletakkan di atasnya (relative z-10) agar
// tetap bisa diklik sendiri; link tidak boleh bersarang. Status project diubah
// di halaman detail, bukan di kartu.
//
// Nilai kontrak & pengeluaran hanya dikirim untuk OWNER (`finance`).

import { CheckCircle2Icon, ChevronRightIcon, CircleDotIcon, HandCoinsIcon, ReceiptTextIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ToneBadge } from "@/components/tone-badge";
import { formatRupiah } from "@/lib/format";
import { NO_PROJECT, PROJECT_STATUS_LABELS } from "../constants";
import type { ProjectCardData } from "../queries";
import { projectAccentStyle } from "./project-accent";
import { ExpenseMeter } from "./project-finance-list";
import { ProjectIcon } from "./project-icon";

export type ProjectCardFinance = { contractValue: number | null; expense: number; usedPercent: number | null };

export function ProjectCard({
  card,
  finance,
  showAdvances,
  showSettlements,
}: {
  card: ProjectCardData;
  finance?: ProjectCardFinance;
  showAdvances: boolean;
  showSettlements: boolean;
}) {
  const s = card.stats;
  const param = card.id ?? NO_PROJECT;
  const awaitingReceipt = s.awaitingAcknowledgment + s.needFill + s.needRevision;

  return (
    <article
      style={projectAccentStyle(card.id ? card.icon : null)}
      className="project-accent group relative flex flex-col overflow-hidden rounded-xl bg-card text-sm ring-1 ring-(--project-border) transition-shadow focus-within:ring-2 focus-within:ring-(--project-strong) hover:ring-2 hover:ring-(--project-strong)"
    >
      <div className="flex items-center gap-3 border-b border-(--project-border) bg-(--project-soft) p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-(--project-strong) text-(--project-on)">
          <ProjectIcon name={card.icon} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          {card.id ? (
            <Link
              href={`/projects/${card.id}`}
              className="block truncate font-semibold outline-none after:absolute after:inset-0"
            >
              {card.name}
            </Link>
          ) : (
            <p className="truncate font-semibold">{card.name}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {card.client ?? (card.id ? "Tanpa nama klien" : "Uang muka sebelum ada project")}
          </p>
        </div>
        {card.id && (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {finance && card.id ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Nilai kontrak</span>
              <span className="font-medium tabular-nums">
                {finance.contractValue === null ? (
                  <span className="text-muted-foreground">Belum diisi</span>
                ) : (
                  formatRupiah(finance.contractValue)
                )}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Pengeluaran</span>
              <ExpenseMeter project={{ name: card.name, ...finance }} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">
              {s.active > 0 ? `${s.active} uang muka berjalan` : s.total > 0 ? "Tidak ada uang muka berjalan" : "Belum ada uang muka"}
            </p>
            <p className="text-xs text-muted-foreground">
              {awaitingReceipt > 0 ? `${awaitingReceipt} perlu dipertanggungjawabkan` : "Tidak ada yang perlu dipertanggungjawabkan"}
              {s.overdue > 0 && ` · ${s.overdue} lewat batas nota`}
            </p>
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="relative z-10 flex flex-wrap gap-1.5">
            {showAdvances && (
              <AccessBadge href={`/advances?project=${param}`} icon={HandCoinsIcon} label="Uang Muka" count={s.active} />
            )}
            {showSettlements && (
              <AccessBadge
                href={`/settlements?project=${param}`}
                icon={ReceiptTextIcon}
                label="Pertanggungjawaban"
                count={awaitingReceipt + s.toVerify}
              />
            )}
          </div>
          {card.status && (
            <ToneBadge tone={card.status === "ACTIVE" ? "success" : "pending"} className="shrink-0">
              {card.status === "ACTIVE" ? <CircleDotIcon /> : <CheckCircle2Icon />}
              {PROJECT_STATUS_LABELS[card.status]}
            </ToneBadge>
          )}
        </div>
      </div>
    </article>
  );
}

function AccessBadge({ href, icon: Icon, label, count }: { href: string; icon: LucideIcon; label: string; count: number }) {
  return (
    <Link
      href={href}
      className="group/badge inline-flex h-7 items-center gap-1.5 rounded-full border border-(--project-border) bg-(--project-soft) px-2.5 text-xs font-medium outline-none transition-colors hover:bg-(--project-strong) hover:text-(--project-on) focus-visible:ring-2 focus-visible:ring-(--project-strong)"
    >
      <Icon className="size-3.5" />
      {label}
      {count > 0 && (
        <span className="rounded-full bg-(--project-strong) px-1.5 text-[11px] text-(--project-on) tabular-nums group-hover/badge:bg-(--project-on) group-hover/badge:text-(--project-strong)">{count}</span>
      )}
    </Link>
  );
}
