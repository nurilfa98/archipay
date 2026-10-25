// Halaman /payroll-deductions (Potong Gaji, OWNER & FINANCE).
//
// - Belum dipotong: sisa uang muka yang lewat batas pengembalian. Bisa
//   diekspor ke Excel (.xlsx) untuk bagian penggajian, lalu ditandai "sudah dipotong".
// - Riwayat potongan: filter Tahun/Bulan periode gaji (?year=&month=).
//
// Polanya sama dengan halaman Uang Muka: judul statis di luar <Suspense>,
// cek permission & data di dalamnya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
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
  const user = await requirePermission("payroll:manage");
  const filters = parsePayrollFilters(await searchParams);
  const [candidates, deductions, years, currentPeriod] = await Promise.all([
    listPayrollCandidates(),
    listPayrollDeductions(filters),
    listPayrollYears(),
    getCurrentPayrollPeriod(),
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
            canRecord: candidate.recipientId !== user.id,
          }))}
        />
      </section>

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
