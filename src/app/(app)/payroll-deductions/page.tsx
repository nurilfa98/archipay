// Halaman /payroll-deductions (Potong Gaji, OWNER & FINANCE; superadmin hanya melihat).
//
// - Belum dipotong: sisa uang muka yang lewat batas pengembalian. Bisa
//   diekspor ke Excel (.xlsx) untuk bagian penggajian, lalu ditandai "sudah dipotong".
// - Riwayat potongan: filter Tahun/Bulan periode gaji (?year=&month=).
// - Denda keterlambatan (BUSINESS-FLOW §18.10): denda yang masih berlaku dari
//   periode absensi yang sudah dikunci Owner, per karyawan per bulan.
//
// Polanya sama dengan halaman Uang Muka: judul statis di luar <Suspense>,
// cek permission & data di dalamnya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { PenaltyDeductAction } from "@/features/attendance/components/review-controls";
import { periodLabel as attendancePeriodLabel } from "@/features/attendance/review-data";
import { listPenaltyCandidates, listPenaltyDeductions } from "@/features/attendance/review-queries";
import { formatRupiah } from "@/lib/format";
import { PayrollCandidatesTable } from "@/features/payroll/components/payroll-candidates-table";
import { PayrollDeductionsTable } from "@/features/payroll/components/payroll-deductions-table";
import { PayrollExportButton } from "@/features/payroll/components/payroll-export-button";
import {
  getCurrentPayrollPeriod,
  listPayrollCandidates,
  listPayrollDeductions,
  listPayrollYears,
} from "@/features/payroll/queries";
import { parsePayrollFilters } from "@/features/payroll/schemas";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateOnly, formatDateTime, zonedDateString } from "@/lib/dates";
import { MONTH_NAMES } from "@/lib/format";

export const metadata: Metadata = {
  title: "Potong Gaji",
};

export default function PayrollDeductionsPage({ searchParams }: PageProps<"/payroll-deductions">) {
  return (
    <>
      <PageHeader
        title="Potong Gaji"
        description="Sisa uang muka yang tidak dikembalikan sampai batas waktu, sesuai pernyataan karyawan saat menerima dana."
        action={<PayrollExportButton />}
      />
      <Suspense fallback={<PayrollSkeleton />}>
        <PayrollContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PayrollContent({ searchParams }: Pick<PageProps<"/payroll-deductions">, "searchParams">) {
  const user = await requirePermission("payroll:view");
  const canManage = can(user, "payroll:manage");
  const filters = parsePayrollFilters(await searchParams);
  const [candidates, deductions, years, currentPeriod, penaltyGroups, penaltyHistory] = await Promise.all([
    listPayrollCandidates(user.company.id),
    listPayrollDeductions(user.company.id, filters),
    listPayrollYears(user.company.id),
    getCurrentPayrollPeriod(),
    listPenaltyCandidates(user.company.id),
    listPenaltyDeductions(user.company.id),
  ]);
  const yearOptions =
    filters.year && !years.includes(filters.year) ? [filters.year, ...years].sort((a, b) => b - a) : years;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-labelledby="payroll-pending-title">
        <h2 id="payroll-pending-title" className="text-sm font-medium">
          Belum dipotong ({candidates.length})
        </h2>
        <PayrollCandidatesTable
          rows={candidates.map((candidate) => ({
            settlementId: candidate.settlementId,
            settlementNumber: candidate.settlementNumber,
            advanceNumber: candidate.advanceNumber,
            recipientName: candidate.recipientName,
            recipientEmail: candidate.recipientEmail,
            returnDueLabel: formatDateOnly(zonedDateString(candidate.returnDueAt)),
            returnDueTime: candidate.returnDueAt.getTime(),
            outstanding: candidate.outstanding,
            defaultPeriod: currentPeriod,
            canRecord: canManage && candidate.recipientId !== user.id,
            isOwn: candidate.recipientId === user.id,
          }))}
        />
      </section>

      {/* Tanpa add-on Absensi, bagian ini hanya tampil bila masih ada denda yang sudah dikunci. */}
      {(user.company.attendance || penaltyGroups.length > 0) && (
        <section className="flex flex-col gap-2" aria-labelledby="penalty-pending-title">
          <h2 id="penalty-pending-title" className="text-sm font-medium">
            Denda keterlambatan belum dipotong ({penaltyGroups.length})
          </h2>
          {penaltyGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Tidak ada denda dari periode absensi yang sudah dikunci.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {penaltyGroups.map((group) => (
                <li
                  key={`${group.userId}-${group.period}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{group.userName}</p>
                    <p className="text-muted-foreground">
                      Absensi {attendancePeriodLabel(group.period)} · {group.count}× terlambat ·{" "}
                      <span className="font-medium text-foreground">{formatRupiah(group.total)}</span>
                    </p>
                  </div>
                  {canManage && group.userId !== user.id && (
                    <PenaltyDeductAction
                      userId={group.userId}
                      period={group.period}
                      summary={`${group.userName}, denda keterlambatan ${attendancePeriodLabel(group.period)}`}
                      total={group.total}
                      defaultPayrollPeriod={currentPeriod}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="payroll-history-title">
        <h2 id="payroll-history-title" className="text-sm font-medium">
          Riwayat potongan
        </h2>
        <PayrollDeductionsTable
          rows={deductions.map((deduction) => ({
            id: deduction.id,
            periodLabel: periodLabel(deduction.period),
            period: deduction.period,
            recipientName: deduction.recipientName,
            settlementId: deduction.settlementId,
            settlementNumber: deduction.settlementNumber,
            advanceNumber: deduction.advanceNumber,
            amount: deduction.amount,
            createdByName: deduction.createdByName,
            createdAtLabel: formatDateTime(deduction.createdAt),
          }))}
          filters={filters}
          years={yearOptions}
        />
      </section>

      {penaltyHistory.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="penalty-history-title">
          <h2 id="penalty-history-title" className="text-sm font-medium">
            Riwayat potongan denda keterlambatan
          </h2>
          <ul className="divide-y rounded-lg border text-sm">
            {penaltyHistory.map((row) => (
              <li
                key={`${row.userId}-${row.period}-${row.payrollPeriod}`}
                className="flex flex-wrap justify-between gap-2 p-3"
              >
                <span>
                  <span className="font-medium">{row.userName}</span> · absensi {attendancePeriodLabel(row.period)} ·{" "}
                  {row.count}×
                </span>
                <span className="text-muted-foreground">
                  {formatRupiah(row.total)} · gaji {periodLabel(row.payrollPeriod)} · {row.deductedByName ?? "-"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// "2026-11" → "November 2026"
function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return month ? `${MONTH_NAMES[month - 1]} ${year}` : period;
}

function PayrollSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
