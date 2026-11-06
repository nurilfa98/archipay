// Halaman /audit (khusus OWNER): riwayat aktivitas, siapa melakukan apa dan
// kapan. Filter Tahun/Bulan/Kategori/Pelaku lewat URL (?year=&month=&category=&actor=).
//
// Polanya sama dengan halaman Uang Muka: judul statis di luar <Suspense>,
// cek permission & data di dalamnya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { periodLabel } from "@/features/attendance/review-data";
import { AuditLogTable } from "@/features/audit/components/audit-log-table";
import { AUDIT_CATEGORY_LABELS, AUDIT_PAGE_LIMIT, auditActionInfo } from "@/features/audit/constants";
import { formatAuditChanges } from "@/features/audit/format-values";
import { listAuditActors, listAuditLogs, listAuditYears, type AuditLogRow } from "@/features/audit/queries";
import { parseAuditFilters } from "@/features/audit/schemas";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateOnly, formatDateTime } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Audit Log",
};

export default function AuditPage({ searchParams }: PageProps<"/audit">) {
  return (
    <>
      <PageHeader title="Audit Log" description="Riwayat aktivitas: siapa melakukan apa dan kapan." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AuditContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AuditContent({ searchParams }: Pick<PageProps<"/audit">, "searchParams">) {
  const user = await requirePermission("audit:view");
  const companyId = user.company.id;
  const filters = parseAuditFilters(await searchParams);
  const [logs, years, actors] = await Promise.all([
    listAuditLogs(companyId, filters),
    listAuditYears(companyId),
    listAuditActors(companyId),
  ]);
  const yearOptions =
    filters.year && !years.includes(filters.year) ? [filters.year, ...years].sort((a, b) => b - a) : years;

  return (
    <AuditLogTable
      rows={logs.map((log) => {
        const info = auditActionInfo(log.action);
        const entity = describeEntity(log);
        return {
          id: log.id,
          createdAtLabel: formatDateTime(log.createdAt),
          createdAtTime: log.createdAt.getTime(),
          // Pelaku kosong = belum login (percobaan login gagal).
          actorName: log.actorName ?? "Belum login",
          actorEmail: log.actorEmail,
          actionLabel: info.label,
          categoryLabel: AUDIT_CATEGORY_LABELS[info.category],
          tone: info.tone,
          ...entity,
          ipAddress: log.ipAddress,
          changes: formatAuditChanges(log.oldValues, log.newValues),
        };
      })}
      filters={filters}
      years={yearOptions}
      actors={actors}
      limited={logs.length >= AUDIT_PAGE_LIMIT}
    />
  );
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);
// Gabungan label dengan " · "; bagian yang kosong dilewati ("-" bila semuanya kosong).
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ") || "-";

// Jenis, nama, dan link data yang terdampak. Data yang sudah tidak ada
// (atau jenis yang belum dikenal) tetap ditampilkan tanpa link.
function describeEntity(log: AuditLogRow): { entityKind: string; entityLabel: string; entityHref: string | null } {
  const label = log.entityLabel ?? "-";
  switch (log.entityName) {
    case "advance_requests":
      return { entityKind: "Uang muka", entityLabel: label, entityHref: `/advances/${log.entityId}` };
    case "settlements":
      return { entityKind: "Pertanggungjawaban", entityLabel: label, entityHref: `/settlements/${log.entityId}` };
    case "users":
      return { entityKind: "Pengguna", entityLabel: label, entityHref: `/users/${log.entityId}` };
    case "expense_categories":
      return { entityKind: "Kategori biaya", entityLabel: label, entityHref: "/settings" };
    case "leave_types":
      return { entityKind: "Jenis cuti/izin", entityLabel: label, entityHref: "/settings#cuti" };
    case "projects":
      return { entityKind: "Proyek", entityLabel: label, entityHref: `/projects/${log.entityId}` };
    case "attendance_records":
      return {
        entityKind: "Absensi",
        entityLabel: join(label, log.entityExtra && formatDateOnly(log.entityExtra)),
        entityHref: null,
      };
    case "attendance_penalties":
      return {
        entityKind: "Denda absensi",
        entityLabel: join(label, log.entityExtra && periodLabel(log.entityExtra)),
        entityHref: null,
      };
    case "attendance_periods":
      return {
        entityKind: "Periode absensi",
        entityLabel: periodLabel(log.entityId),
        entityHref: `/attendance/review?period=${log.entityId}`,
      };
    case "attendance_locations":
      return { entityKind: "Lokasi absensi", entityLabel: label, entityHref: "/attendance/locations" };
    case "attendance_holidays": {
      // Hari libur yang sudah dihapus tinggal di catatan nilai lama.
      const name = log.entityLabel ?? text(log.oldValues?.name) ?? text(log.newValues?.name);
      const date = log.entityExtra ?? text(log.oldValues?.holidayDate) ?? text(log.newValues?.holidayDate);
      return { entityKind: "Hari libur", entityLabel: join(name, date && formatDateOnly(date)), entityHref: null };
    }
    case "leave_requests":
      return {
        entityKind: "Cuti/izin",
        entityLabel: join(label, log.entityExtra),
        entityHref: "/attendance/leave",
      };
    case "payroll_runs":
      return {
        entityKind: "Penggajian",
        entityLabel: log.entityExtra ? periodLabel(log.entityExtra) : "-",
        entityHref: log.entityExtra ? `/payroll/${log.entityExtra}` : null,
      };
    case "subscriptions":
      return {
        entityKind: "Langganan",
        entityLabel: text(log.newValues?.plan) ?? "-",
        entityHref: "/subscription",
      };
    case "face_profiles":
      return { entityKind: "Foto wajah", entityLabel: label, entityHref: null };
    case "attendance_consents":
      return { entityKind: "Persetujuan data wajah", entityLabel: label, entityHref: null };
    case "company_settings":
      return { entityKind: "Pengaturan", entityLabel: "Kebijakan uang muka", entityHref: "/settings" };
    default:
      return { entityKind: log.entityName, entityLabel: log.entityId, entityHref: null };
  }
}
