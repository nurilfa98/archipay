// Halaman /payroll/salaries (Data gaji, Owner & Finance / salary:prepare, BUSINESS-FLOW
// §20.3): pengguna aktif company beserta gaji pokok, tunjangan & potongan
// tetap per bulan. Yang belum diisi tidak ikut penggajian.

import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { listSalaryPeople } from "@/features/salaries/queries";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateOnly } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

export const metadata: Metadata = {
  title: "Data gaji",
};

export default function SalariesPage() {
  return (
    <>
      <PageHeader
        title="Data gaji"
        description="Gaji pokok, tunjangan, dan potongan tetap per karyawan. Hanya Owner dan Finance yang bisa melihat."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SalariesContent />
      </Suspense>
    </>
  );
}

async function SalariesContent() {
  const user = await requirePermission("salary:prepare");
  const people = await listSalaryPeople(user.company.id);
  const missing = people.filter((person) => person.isActive && !person.profile).length;

  return (
    <div className="flex flex-col gap-3">
      {missing > 0 && (
        <p className="text-sm text-muted-foreground">
          {missing} pengguna aktif belum punya data gaji dan tidak ikut penggajian.
        </p>
      )}
      <ul className="divide-y rounded-xl border bg-card">
        {people.map((person) => (
          <li key={person.id}>
            <Link
              href={`/payroll/salaries/${person.id}`}
              className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {person.fullName}
                  {!person.isActive && <ToneBadge tone="pending">Nonaktif</ToneBadge>}
                  {!person.profile && <ToneBadge tone="warning">Belum diisi</ToneBadge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {person.profile
                    ? [
                        `Gaji pokok ${formatRupiah(person.profile.baseSalary)}`,
                        person.profile.allowances > 0 && `tunjangan ${formatRupiah(person.profile.allowances)}`,
                        person.profile.deductions > 0 && `potongan tetap ${formatRupiah(person.profile.deductions)}`,
                        person.profile.startDate && `mulai ${formatDateOnly(person.profile.startDate)}`,
                        person.profile.endDate && `berhenti ${formatDateOnly(person.profile.endDate)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : person.email}
                </p>
                {person.profile && !person.hasBankAccount && (
                  <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                    <TriangleAlertIcon className="size-3.5" />
                    Rekening bank belum diisi di data pengguna
                  </p>
                )}
              </div>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
