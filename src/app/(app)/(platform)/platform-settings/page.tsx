// Halaman /platform-settings (Pengaturan platform, Superadmin /
// subscription:manage): komponen harga paket (harga 6 bulan & 1 tahun dihitung
// otomatis dari harga per bulan & diskon), masa gratis & tenggang + batas
// pengguna masa gratis, nomor WhatsApp admin, rekening bank, dan QRIS statis.
// Harga khusus per company diatur di detail company → Langganan.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BankAccountsManager,
  PlatformSettingsForm,
  PricingForm,
  QrisForm,
} from "@/features/subscriptions/components/platform-forms";
import { getStandardPricing, listBankAccounts } from "@/features/subscriptions/queries";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { getPlatformSettings } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "Pengaturan platform",
};

export default function PlatformSettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan platform" description="Berlaku untuk semua company ArchiPay." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PlatformSettingsContent />
      </Suspense>
    </>
  );
}

async function PlatformSettingsContent() {
  const user = await requirePlatformAdmin();
  if (!can(user, "subscription:manage")) redirect("/companies");
  const [pricing, settings, accounts] = await Promise.all([
    getStandardPricing(),
    getPlatformSettings(),
    listBankAccounts(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Harga paket</CardTitle>
          <CardDescription>
            Harga dasar per bulan sudah termasuk sejumlah pengguna; pengguna aktif di atasnya dikenai biaya tambahan.
            Paket 6 bulan & 1 tahun dihitung otomatis dari harga per bulan dikurangi diskon. Tagihan yang sudah dibuat
            tidak ikut berubah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PricingForm pricing={pricing} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Masa gratis & tenggang</CardTitle>
          <CardDescription>
            Lewat masa tenggang, company terkunci: Owner hanya bisa membuka menu Langganan, Finance & Karyawan tidak
            bisa login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformSettingsForm settings={settings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rekening pembayaran</CardTitle>
          <CardDescription>Tampil ke Owner saat memilih paket. Boleh lebih dari satu.</CardDescription>
        </CardHeader>
        <CardContent>
          <BankAccountsManager accounts={accounts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QRIS</CardTitle>
          <CardDescription>Opsional. Owner memindai lalu mengetik nominal sendiri.</CardDescription>
        </CardHeader>
        <CardContent>
          <QrisForm hasQris={!!settings.qrisImageKey} />
        </CardContent>
      </Card>
    </div>
  );
}
