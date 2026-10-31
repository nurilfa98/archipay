// Halaman /settings (Pengaturan, khusus OWNER): kebijakan uang muka dan
// kategori biaya. Polanya sama dengan halaman lain: judul statis di luar
// <Suspense>, cek permission & data di dalamnya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanySettingsForm } from "@/features/settings/components/company-settings-form";
import { ExpenseCategoriesManager } from "@/features/settings/components/expense-categories-manager";
import { getCompanySettings, getSettingsUpdateInfo, listAllExpenseCategories } from "@/features/settings/queries";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Pengaturan",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" description="Kebijakan uang muka dan kategori biaya perusahaan." />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const user = await requirePermission("settings:manage");
  const [settings, updateInfo, categories] = await Promise.all([
    getCompanySettings(user.company.id),
    getSettingsUpdateInfo(user.company.id),
    listAllExpenseCategories(user.company.id),
  ]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Kebijakan uang muka</CardTitle>
          <CardDescription>
            Perubahan hanya berlaku untuk uang muka yang dicairkan setelah disimpan. Uang muka yang sudah
            berjalan tetap memakai aturan yang disetujui karyawan saat menerima dana.
            {updateInfo.updatedByName &&
              ` Terakhir diubah ${updateInfo.updatedByName}, ${formatDateTime(updateInfo.updatedAt)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanySettingsForm settings={settings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kategori biaya</CardTitle>
          <CardDescription>Dipilih karyawan untuk setiap nota di pertanggungjawaban.</CardDescription>
        </CardHeader>
        <CardContent>
          <ExpenseCategoriesManager categories={categories} />
        </CardContent>
      </Card>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </>
  );
}
