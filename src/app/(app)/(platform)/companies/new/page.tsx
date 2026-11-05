// Halaman /companies/new (platform, khusus Superadmin): tambah company beserta
// Owner pertamanya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyCreateForm } from "@/features/companies/components/company-form";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { getPlatformSettings } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "Tambah Perusahaan",
};

export default function NewCompanyPage() {
  return (
    <>
      <PageHeader
        title="Tambah perusahaan"
        description="Pengaturan awal dan kategori biaya dibuat otomatis, lalu bisa diubah Owner di menu Pengaturan."
      />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96 w-full max-w-xl" />}>
            <NewCompanyContent />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function NewCompanyContent() {
  await requirePlatformAdmin();
  const { freeDays, trialMaxUsers } = await getPlatformSettings();
  return <CompanyCreateForm trialDefaults={{ freeDays, trialMaxUsers }} />;
}
