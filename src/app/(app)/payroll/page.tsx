// Halaman /payroll (Penggajian, add-on, Owner & Finance / salary:prepare,
// BUSINESS-FLOW §20): buat penggajian bulan tertentu, daftar penggajian per
// bulan, dan tautan ke Data gaji. Superadmin tidak bisa membuka (data gaji rahasia).

import { ChevronRightIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { periodLabel, previousPeriod } from "@/features/attendance/review-data";
import { CreateRunForm } from "@/features/salaries/components/run-controls";
import { RUN_STATUS_LABELS, RUN_STATUS_TONES } from "@/features/salaries/constants";
import { listRuns, listSalaryPeople } from "@/features/salaries/queries";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateOnly, zonedDateString } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

export const metadata: Metadata = {
  title: "Penggajian",
};

export default function PayrollPage() {
  return (
    <>
      <PageHeader
        title="Penggajian"
        description="Gaji bersih per karyawan setiap bulan dari data gaji, absensi, sisa uang muka, dan denda."
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/payroll/salaries" />}>
            <UsersIcon />
            Data gaji
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <PayrollContent />
      </Suspense>
    </>
  );
}

async function PayrollContent() {
  const user = await requirePermission("salary:prepare");
  const isOwner = can(user, "salary:manage");
  const [runs, people] = await Promise.all([listRuns(user.company.id), listSalaryPeople(user.company.id)]);
  const thisMonth = zonedDateString(new Date()).slice(0, 7);
  const withSalary = people.filter((person) => person.profile).length;
  const existing = new Set(runs.map((run) => run.period));
  const defaultPeriod = [thisMonth, previousPeriod(thisMonth)].find((period) => !existing.has(period)) ?? thisMonth;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Buat penggajian</CardTitle>
          <CardDescription>
            {withSalary === 0
              ? "Belum ada karyawan dengan data gaji. Isi Data gaji dulu."
              : `${withSalary} karyawan punya data gaji. ArchiPay menyusun draf slip; ${isOwner ? "Anda memeriksa lalu menyelesaikannya." : "Anda menyiapkannya lalu mengirim ke Owner untuk diselesaikan."}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateRunForm defaultPeriod={defaultPeriod} maxPeriod={thisMonth} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Riwayat penggajian</h2>
        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Belum ada penggajian.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/payroll/${run.period}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex items-center gap-2 font-medium">
                      {periodLabel(run.period)}
                      <ToneBadge tone={RUN_STATUS_TONES[run.status]}>{RUN_STATUS_LABELS[run.status]}</ToneBadge>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {run.people} karyawan
                      {run.payDate && ` · dibayar ${formatDateOnly(run.payDate)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatRupiah(run.totalNet)}</span>
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
