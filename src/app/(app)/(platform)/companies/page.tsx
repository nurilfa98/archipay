// Halaman /companies (platform, khusus Superadmin): halaman pertama Superadmin
// setelah login. Daftar kartu company (klien) ArchiPay dengan pencarian &
// saring status, tombol tambah company, dan tombol "Buka" di tiap kartu untuk
// masuk ke company. Klik kartu = detail company. Kartu diurutkan dari yang
// perlu tindakan (terkunci, tenggang, segera habis), dan pita di atasnya
// mengingatkan tagihan yang menunggu verifikasi.
//
// Judul statis di luar <Suspense>; daftar membaca cookie & database di dalamnya.

import { ArrowRightIcon, PlusIcon, ReceiptTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyCard, ownerNames } from "@/features/companies/components/company-card";
import { CompanySearchList } from "@/features/companies/components/company-search";
import { listCompanies } from "@/features/companies/queries";
import { compareCompanies, companyStatusOf, isExpiringSoon } from "@/features/companies/status";
import { countClaimedSubscriptions } from "@/features/subscriptions/queries";
import { requirePlatformAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Company",
};

export default function CompaniesPage() {
  return (
    <>
      <PageHeader
        title="Company"
        description="Klien ArchiPay. Klik kartu untuk detail, atau Buka untuk melihat semua menunya."
        action={
          <Button nativeButton={false} render={<Link href="/companies/new" />}>
            <PlusIcon />
            Tambah company
          </Button>
        }
      />
      <Suspense fallback={<CompaniesSkeleton />}>
        <CompaniesContent />
      </Suspense>
    </>
  );
}

async function CompaniesContent() {
  const user = await requirePlatformAdmin();
  const [companies, claimed] = await Promise.all([listCompanies(), countClaimedSubscriptions()]);

  if (companies.length === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-dashed p-6 text-sm">
        <p className="font-medium">Belum ada company.</p>
        <p className="text-muted-foreground">Klik &quot;Tambah company&quot; untuk mendaftarkan klien pertama beserta Owner-nya.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {claimed > 0 && (
        <Alert className="border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40">
          <ReceiptTextIcon />
          <AlertTitle>{claimed} tagihan menunggu verifikasi</AlertTitle>
          <AlertDescription>Cocokkan dengan mutasi rekening, lalu terima atau tolak pembayarannya.</AlertDescription>
          <AlertAction>
            <Button size="sm" nativeButton={false} render={<Link href="/billing" />}>
              Buka Tagihan
              <ArrowRightIcon />
            </Button>
          </AlertAction>
        </Alert>
      )}
      <CompanySearchList
        entries={[...companies].sort(compareCompanies).map((company) => {
          const status = companyStatusOf(company);
          return {
            key: company.id,
            searchText: `${company.name} ${ownerNames(company)} ${company.owners.map((owner) => owner.email).join(" ")}`,
            status,
            soon: isExpiringSoon(company),
            card: <CompanyCard company={company} status={status} opened={company.id === user.company?.id} />,
          };
        })}
      />
    </div>
  );
}

function CompaniesSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Skeleton className="h-44" />
      <Skeleton className="h-44" />
      <Skeleton className="h-44" />
    </div>
  );
}
