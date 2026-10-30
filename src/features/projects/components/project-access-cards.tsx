// Dua kartu akses di halaman detail project: "Uang Muka" dan
// "Pertanggungjawaban". Server Component. Klik = daftar yang sudah terikat ke
// project ini, dengan ringkasan hitungan yang boleh dilihat viewer.

import { ChevronRightIcon, HandCoinsIcon, ReceiptTextIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ToneBadge, type Tone } from "@/components/tone-badge";
import { formatRupiah } from "@/lib/format";
import type { ProjectStats } from "../queries";

type Chip = { count: number; label: string; tone: Tone };

export function ProjectAccessCards({
  projectId,
  stats: s,
  showAdvances,
  showSettlements,
}: {
  projectId: string;
  stats: ProjectStats;
  showAdvances: boolean;
  showSettlements: boolean;
}) {
  const awaitingReceipt = s.awaitingAcknowledgment + s.needFill + s.needRevision;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {showAdvances && (
        <AccessCard
          href={`/advances?project=${projectId}`}
          icon={HandCoinsIcon}
          title="Uang Muka"
          headline={
            s.active > 0 ? `${s.active} uang muka berjalan` : s.total > 0 ? "Tidak ada uang muka berjalan" : "Belum ada uang muka"
          }
          detail={s.outstandingAmount > 0 ? `Dana beredar ${formatRupiah(s.outstandingAmount)}` : null}
          chips={[
            { count: s.pendingApproval, label: "menunggu persetujuan", tone: "pending" },
            { count: s.awaitingDisbursement, label: "belum dicairkan", tone: "active" },
            { count: s.awaitingAcknowledgment, label: "menunggu konfirmasi", tone: "active" },
            { count: s.overdue, label: "lewat batas nota", tone: "warning" },
          ]}
        />
      )}
      {showSettlements && (
        <AccessCard
          href={`/settlements?project=${projectId}`}
          icon={ReceiptTextIcon}
          title="Pertanggungjawaban"
          headline={
            awaitingReceipt > 0
              ? `${awaitingReceipt} uang muka perlu dipertanggungjawabkan`
              : "Tidak ada yang perlu dipertanggungjawabkan"
          }
          detail={null}
          chips={[
            { count: s.needFill, label: "perlu diisi", tone: "active" },
            { count: s.needRevision, label: "perlu diperbaiki", tone: "warning" },
            { count: s.toVerify, label: "menunggu verifikasi", tone: "active" },
            { count: s.returnPending, label: "sisa belum dikembalikan", tone: "warning" },
            { count: s.reimbursePending, label: "menunggu penggantian", tone: "warning" },
            { count: s.overdue, label: "lewat batas nota", tone: "danger" },
          ]}
        />
      )}
    </div>
  );
}

function AccessCard({
  href,
  icon: Icon,
  title,
  headline,
  detail,
  chips,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  headline: string;
  detail: string | null;
  chips: Chip[];
}) {
  const visible = chips.filter((chip) => chip.count > 0);
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10 outline-none transition-shadow hover:ring-2 hover:ring-(--project-strong) focus-visible:ring-2 focus-visible:ring-(--project-strong)"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-(--project-soft) text-(--project-strong)">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{headline}</p>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      {visible.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {visible.map((chip) => (
            <li key={chip.label}>
              <ToneBadge tone={chip.tone}>
                <span className="font-semibold tabular-nums">{chip.count}</span> {chip.label}
              </ToneBadge>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
