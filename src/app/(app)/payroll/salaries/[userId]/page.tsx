// Halaman /payroll/salaries/[userId]: isi/ubah data gaji satu karyawan
// (Owner / salary:manage, BUSINESS-FLOW §20.3).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteSalaryProfileButton } from "@/features/salaries/components/run-controls";
import { SalaryProfileForm } from "@/features/salaries/components/salary-profile-form";
import { getPayrollSettings, getSalaryProfile } from "@/features/salaries/queries";
import { idSchema } from "@/features/salaries/schemas";
import { requirePermission } from "@/lib/auth/dal";
import { formatAccountNumber } from "@/lib/bank";

export const metadata: Metadata = {
  title: "Data gaji karyawan",
};

export default function SalaryProfilePage({ params }: PageProps<"/payroll/salaries/[userId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SalaryProfileContent params={params} />
    </Suspense>
  );
}

async function SalaryProfileContent({ params }: Pick<PageProps<"/payroll/salaries/[userId]">, "params">) {
  const user = await requirePermission("salary:manage");
  const userId = idSchema.safeParse((await params).userId);
  if (!userId.success) notFound();
  const [detail, settings] = await Promise.all([
    getSalaryProfile(user.company.id, userId.data),
    getPayrollSettings(user.company.id),
  ]);
  if (!detail) notFound();
  const { user: person, profile } = detail;

  return (
    <>
      <PageHeader
        title={person.fullName}
        description={
          person.bankName && person.bankAccountNumber
            ? `Rekening ${person.bankName} ${formatAccountNumber(person.bankName, person.bankAccountNumber)}`
            : "Rekening bank belum diisi (ubah di menu Pengguna)."
        }
        action={profile ? <DeleteSalaryProfileButton userId={person.id} fullName={person.fullName} /> : undefined}
      />
      <Link href="/payroll/salaries" className="text-sm text-brand hover:underline">
        ← Kembali ke Data gaji
      </Link>
      <Card>
        <CardContent>
          <SalaryProfileForm userId={person.id} profile={profile} dailyRateMethod={settings.dailyRateMethod} />
        </CardContent>
      </Card>
    </>
  );
}
