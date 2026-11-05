// Halaman /payroll/salaries/[userId]: isi/ubah data gaji satu karyawan
// (Owner & Finance / salary:prepare, BUSINESS-FLOW §20.1, §20.3). Data gaji
// Finance sendiri, Owner, dan Finance lain tampil baca saja untuk Finance
// (features/salaries/access.ts).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { salaryEditChecker } from "@/features/salaries/access";
import { DeleteSalaryProfileButton } from "@/features/salaries/components/run-controls";
import { SalaryProfileForm } from "@/features/salaries/components/salary-profile-form";
import { getPayrollSettings, getSalaryProfile } from "@/features/salaries/queries";
import { idSchema } from "@/features/salaries/schemas";
import { requirePermission } from "@/lib/auth/dal";
import { CopyButton } from "@/components/copy-button";
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
  const user = await requirePermission("salary:prepare");
  const userId = idSchema.safeParse((await params).userId);
  if (!userId.success) notFound();
  const [detail, settings, canEdit] = await Promise.all([
    getSalaryProfile(user.company.id, userId.data),
    getPayrollSettings(user.company.id),
    salaryEditChecker(user),
  ]);
  if (!detail) notFound();
  const { user: person, profile } = detail;
  const readOnly = !canEdit(person.id);

  return (
    <>
      <PageHeader
        title={person.fullName}
        description={
          person.bankName && person.bankAccountNumber ? (
            <span className="inline-flex items-center gap-1">
              Rekening {person.bankName} {formatAccountNumber(person.bankName, person.bankAccountNumber)}
              <CopyButton
                value={person.bankAccountNumber}
                label={`Salin nomor rekening ${person.fullName}`}
                successMessage="Nomor rekening disalin."
              />
            </span>
          ) : (
            "Rekening bank belum diisi (ubah di menu Pengguna)."
          )
        }
        action={
          profile && !readOnly ? <DeleteSalaryProfileButton userId={person.id} fullName={person.fullName} /> : undefined
        }
      />
      <Link href="/payroll/salaries" className="text-sm text-brand hover:underline">
        ← Kembali ke Data gaji
      </Link>
      <Card>
        <CardContent>
          {readOnly && (
            <p className="mb-4 text-sm text-muted-foreground">
              Baca saja. Data gaji Anda sendiri, Owner, dan Finance lain hanya bisa diubah Owner.
            </p>
          )}
          <SalaryProfileForm
            userId={person.id}
            profile={profile}
            dailyRateMethod={settings.dailyRateMethod}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>
    </>
  );
}
