// Halaman /audit (khusus OWNER): riwayat aktivitas, siapa melakukan apa dan
// kapan. Filter Tahun/Bulan/Kategori/Pelaku lewat URL (?year=&month=&category=&actor=).
//
// Polanya sama dengan halaman Uang Muka: judul statis di luar <Suspense>,
// cek permission & data di dalamnya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditLogTable } from "@/features/audit/components/audit-log-table";
import { AUDIT_CATEGORY_LABELS, AUDIT_PAGE_LIMIT, auditActionInfo } from "@/features/audit/constants";
import { formatAuditChanges } from "@/features/audit/format-values";
import { listAuditActors, listAuditLogs, listAuditYears, type AuditLogRow } from "@/features/audit/queries";
import { parseAuditFilters } from "@/features/audit/schemas";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/dates";

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
    case "projects":
      return { entityKind: "Project", entityLabel: label, entityHref: `/projects/${log.entityId}` };
    case "company_settings":
      return { entityKind: "Pengaturan", entityLabel: "Kebijakan uang muka", entityHref: "/settings" };
    default:
      return { entityKind: log.entityName, entityLabel: log.entityId, entityHref: null };
  }
}
