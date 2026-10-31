// Halaman /settlements (Pertanggungjawaban). Polanya sama dengan
// (app)/advances/page.tsx: judul statis di luar <Suspense>, cek permission &
// data di dalamnya, dan dua tahap:
// 1. Tanpa ?project= (atau project tidak ada): kembali ke /projects.
//    Pertanggungjawaban dibuka dari badge di kartu project.
// 2. Dengan ?project=<id> (atau none): daftar yang sudah disaring per project.
//
// Isi daftar:
// - "Perlu tindakan Anda": isi/perbaiki nota (karyawan), verifikasi (OWNER/FINANCE).
// - Daftar laporan: OWNER/FINANCE melihat semua, karyawan hanya miliknya.
//   Filter ?year=&month=&status= diterapkan server.
//
// Referensi: node_modules/next/dist/docs/01-app/02-guides/streaming.md

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { NO_PROJECT } from "@/features/projects/constants";
import { ProjectBanner } from "@/features/projects/components/project-banner";
import { resolveProjectScope } from "@/features/projects/queries";
import { readProjectParam } from "@/features/projects/schemas";
import { SettlementTodoList } from "@/features/settlements/components/settlement-todo-list";
import { SettlementsTable, type SettlementRow } from "@/features/settlements/components/settlements-table";
import { toAdvanceStatus } from "@/features/settlements/constants";
import {
  listSettlements,
  listSettlementTodos,
  listSettlementYears,
  type SettlementListItem,
} from "@/features/settlements/queries";
import { parseSettlementFilters } from "@/features/settlements/schemas";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Pertanggungjawaban",
};

// Sama dengan riwayat uang muka: pencarian & halaman diproses di browser.
const HISTORY_LIMIT = 500;

export default function SettlementsPage({ searchParams }: PageProps<"/settlements">) {
  return (
    <>
      <PageHeader
        title="Pertanggungjawaban"
        description="Laporan penggunaan uang muka beserta nota belanja, per project."
      />
      <Suspense fallback={<SettlementsSkeleton />}>
        <SettlementsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SettlementsContent({ searchParams }: Pick<PageProps<"/settlements">, "searchParams">) {
  // Melihat cukup advance:view-own (superadmin melihat tanpa bisa mengunggah nota).
  const user = await requirePermission("advance:view-own");
  const params = await searchParams;
  const scope = await resolveProjectScope(readProjectParam(params));

  // Pertanggungjawaban selalu dibuka dari kartu project; tanpa project yang
  // valid kembali ke halaman Project.
  if (scope.kind === "picker") redirect("/projects");

  const projectFilter = scope.kind === "project" ? scope.project.id : NO_PROJECT;
  const viewAll = can(user, "advance:view-all");
  const recipientId = viewAll ? undefined : user.id;
  const filters = parseSettlementFilters(params);

  const [todos, history, years] = await Promise.all([
    // "Perlu tindakan" tidak ikut filter periode: tugas yang tertunda selalu tampil.
    listSettlementTodos({ id: user.id, canVerify: can(user, "settlement:verify"), project: projectFilter }),
    listSettlements({
      recipientId,
      project: projectFilter,
      year: filters.year,
      month: filters.month,
      advanceStatuses: filters.status ? [toAdvanceStatus(filters.status)] : undefined,
      limit: HISTORY_LIMIT,
    }),
    listSettlementYears({ recipientId, project: projectFilter }),
  ]);
  const yearOptions =
    filters.year && !years.includes(filters.year) ? [filters.year, ...years].sort((a, b) => b - a) : years;

  return (
    <div className="flex flex-col gap-6">
      <ProjectBanner project={scope.kind === "project" ? scope.project : null} />
      <SettlementTodoList todos={todos} />
      <section className="flex flex-col gap-2" aria-labelledby="settlement-history-title">
        <h2 id="settlement-history-title" className="text-sm font-medium">
          {viewAll ? "Semua pertanggungjawaban" : "Pertanggungjawaban saya"}
        </h2>
        <SettlementsTable
          rows={history.map(toRow)}
          showRecipient={viewAll}
          filters={filters}
          years={yearOptions}
        />
      </section>
    </div>
  );
}

// Data untuk data table (Client Component): tanggal diformat di server.
function toRow(settlement: SettlementListItem): SettlementRow {
  return {
    id: settlement.id,
    numberLabel: settlement.number ?? "Draf",
    lateReason: settlement.lateReason,
    advanceNumber: settlement.advanceNumber,
    purpose: settlement.purpose,
    recipientName: settlement.recipientName,
    submittedAtLabel: settlement.submittedAt ? formatDateTime(settlement.submittedAt) : null,
    submittedAtTime: settlement.submittedAt?.getTime() ?? null,
    itemCount: settlement.itemCount,
    itemTotal: settlement.itemTotal,
    balanceAmount: settlement.balanceAmount,
    returnOverdue: settlement.returnOverdue,
    status: settlement.status,
  };
}

function SettlementsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
