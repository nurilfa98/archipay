// Kartu satu company di menu Company (Superadmin). Server Component.
//
//   ┌──────────────────────────────────────┐
//   │ [ikon] Nama company              >   │  klik kartu = detail company
//   │        Owner: Budi, Sari             │  warna & ikon = status (status.ts)
//   │        Owner: Budi, Sari             │
//   ├──────────────────────────────────────┤
//   │ 12/25 pengguna · 5 project           │  pengguna aktif / batas paket
//   │ Gratis s.d. 14 Nov 2026 · 12 hari    │  masa aktif (merah/kuning bila perlu tindakan)
//   │ [Buka →]                   (Aktif)   │  Buka = masuk ke company
//   └──────────────────────────────────────┘
//
// Sama seperti kartu project: seluruh kartu bisa diklik lewat link nama yang
// direntangkan (after:absolute inset-0), sedangkan tombol "Buka" diletakkan di
// atasnya (relative z-10) agar tetap bisa diklik sendiri. Warna kartu & ikon
// mengikuti status company (aturan di ../status.ts) lewat kelas .project-accent.

import { CalendarClockIcon, ChevronRightIcon, FolderKanbanIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import type { CompanyListItem } from "@/features/companies/queries";
import { formatShortDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { COMPANY_STATUS, companyAccentStyle, isExpiringSoon, type CompanyStatus } from "../status";
import { CompanyStatusBadge } from "./company-status-badge";
import { EnterCompanyButton } from "./enter-company-button";

export function CompanyCard({
  company,
  status,
  opened,
}: {
  company: CompanyListItem;
  status: CompanyStatus;
  // true = company ini sedang dibuka Superadmin.
  opened: boolean;
}) {
  const StatusIcon = COMPANY_STATUS[status].icon;
  return (
    <article
      style={companyAccentStyle(status)}
      className={cn(
        "project-accent group relative flex flex-col overflow-hidden rounded-xl bg-card text-sm ring-1 ring-(--project-border) transition-shadow focus-within:ring-2 focus-within:ring-(--project-strong) hover:ring-2 hover:ring-(--project-strong)",
        opened && "ring-2 ring-(--project-strong)",
      )}
    >
      <div className="flex items-center gap-3 border-b border-(--project-border) bg-(--project-soft) p-4">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-(--project-strong) text-(--project-on)"
          title={COMPANY_STATUS[status].description}
        >
          <StatusIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/companies/${company.id}`}
            className="block truncate font-semibold outline-none after:absolute after:inset-0"
          >
            {company.name}
          </Link>
          <p className={cn("truncate text-xs", company.owners.length ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300")}>
            {company.owners.length ? `Owner: ${ownerNames(company)}` : "Belum ada Owner"}
          </p>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="size-4 text-muted-foreground" />
              {company.userCount}/{company.userLimit} pengguna
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FolderKanbanIcon className="size-4 text-muted-foreground" />
              {company.projectCount} project
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Bergabung {formatShortDate(company.createdAt)}
            {company.phoneNumber && ` · ${formatPhone(company.phoneNumber)}`}
          </p>
        </div>

        <p
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            status === "LOCKED" && "text-rose-700 dark:text-rose-300",
            (status === "GRACE" || isExpiringSoon(company)) && "text-amber-700 dark:text-amber-300",
          )}
        >
          <CalendarClockIcon className="size-3.5 shrink-0" />
          {accessLabel(company, status)}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="relative z-10">
            <EnterCompanyButton companyId={company.id} active={opened} size="sm" />
          </div>
          <CompanyStatusBadge status={status} />
        </div>
      </div>
    </article>
  );
}

// Masa aktif satu baris, dipakai juga di detail company.
export function accessLabel(company: Pick<CompanyListItem, "access">, status: CompanyStatus) {
  const { until, graceUntil, daysLeft } = company.access;
  const left = daysLeft <= 0 ? "berakhir hari ini" : `${daysLeft} hari lagi`;
  switch (status) {
    case "TRIAL":
      return `Gratis s.d. ${formatShortDate(until)} · ${left}`;
    case "ACTIVE":
      return `Aktif s.d. ${formatShortDate(until)} · ${left}`;
    case "GRACE":
      return `Habis ${formatShortDate(until)} · tenggang s.d. ${formatShortDate(graceUntil)}`;
    case "LOCKED":
      return `Terkunci sejak ${formatShortDate(graceUntil)}`;
    case "INACTIVE":
      return `Masa aktif s.d. ${formatShortDate(until)}`;
  }
}

export function ownerNames(company: CompanyListItem) {
  return company.owners.map((owner) => owner.fullName).join(", ");
}
