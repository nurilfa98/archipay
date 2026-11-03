// Halaman /payslips (Slip Gaji, salary:view-own, BUSINESS-FLOW §20.5): slip
// gaji milik sendiri dari penggajian yang sudah diselesaikan Owner, bisa
// diunduh PDF. Tanpa WhatsApp/email (kuota WhatsApp).

import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { periodLabel } from "@/features/attendance/review-data";
import { listOwnPayslips } from "@/features/salaries/queries";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateOnly } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

export const metadata: Metadata = {
  title: "Slip Gaji",
};

export default function PayslipsPage() {
  return (
    <>
      <PageHeader title="Slip Gaji" description="Slip gaji Anda setiap bulan setelah penggajian diselesaikan Owner." />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <PayslipsContent />
      </Suspense>
    </>
  );
}

async function PayslipsContent() {
  const user = await requirePermission("salary:view-own");
  const slips = await listOwnPayslips(user.company.id, user.id);

  if (slips.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Belum ada slip gaji.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {slips.map((slip) => (
        <li key={slip.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">{periodLabel(slip.period)}</p>
            <p className="text-sm text-muted-foreground">
              Gaji bersih <span className="font-medium text-foreground tabular-nums">{formatRupiah(slip.netPay)}</span>
              {slip.payDate && ` · dibayar ${formatDateOnly(slip.payDate)}`}
            </p>
          </div>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/payslips/${slip.id}`} />}>
            <DownloadIcon />
            Unduh PDF
          </Button>
        </li>
      ))}
    </ul>
  );
}
