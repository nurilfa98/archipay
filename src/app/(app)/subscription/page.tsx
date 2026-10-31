// Halaman /subscription (Langganan, khusus Owner / subscription:view):
// status masa aktif & batas pengguna company, tagihan yang sedang berjalan,
// pilihan paket (jumlah pengguna + periode, harga dihitung otomatis), tambah
// kuota pengguna prorata, dan riwayat tagihan (BUSINESS-FLOW §17).
//
// Tetap bisa dibuka saat company terkunci (allowLocked): justru dari sinilah
// Owner memperpanjang. Saat terkunci, menu lain mengarah ke halaman ini.

import { CircleAlertIcon, ClockIcon, LockIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { accessLabel } from "@/features/companies/components/company-card";
import { CompanyStatusBadge } from "@/features/companies/components/company-status-badge";
import { InvoiceCard } from "@/features/subscriptions/components/invoice-card";
import { PaymentPanel, PlanPicker, TopupPicker } from "@/features/subscriptions/components/plan-picker";
import { invoiceLabel } from "@/features/subscriptions/labels";
import { minPlanUsers } from "@/features/subscriptions/pricing";
import {
  getCompanyPricing,
  getCompanySubscriptionState,
  listBankAccounts,
  listSubscriptions,
} from "@/features/subscriptions/queries";
import { requirePermission } from "@/lib/auth/dal";
import { formatDate, formatShortDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { getPlatformSettings } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "Langganan",
};

export default function SubscriptionPage() {
  return (
    <>
      <PageHeader title="Langganan" description="Masa aktif ArchiPay company Anda, pilihan paket, dan riwayat tagihan." />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SubscriptionContent />
      </Suspense>
    </>
  );
}

async function SubscriptionContent() {
  const user = await requirePermission("subscription:view", { allowLocked: true });
  const companyId = user.company.id;
  const [state, { pricing }, banks, settings, history] = await Promise.all([
    getCompanySubscriptionState(companyId),
    getCompanyPricing(companyId),
    listBankAccounts(),
    getPlatformSettings(),
    listSubscriptions({ companyId }),
  ]);
  if (!state) return null;

  const { access, open, lastRejected, seats } = state;
  const status = access.status;
  const payment = { banks, hasQris: !!settings.qrisImageKey };
  const past = history.filter((invoice) => invoice.id !== open?.id);
  const minUsers = minPlanUsers(pricing, seats.active);
  const canTopup = status === "ACTIVE" && access.daysLeft >= 1;

  return (
    <div className="flex flex-col gap-6">
      {access.locked && (
        <Alert variant="destructive">
          <LockIcon />
          <AlertTitle>Akses company dikunci</AlertTitle>
          <AlertDescription>
            Masa berlangganan habis. Finance & Karyawan tidak bisa masuk, dan menu lain baru terbuka lagi setelah
            pembayaran diverifikasi admin ArchiPay.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Status
            <CompanyStatusBadge status={status} />
          </CardTitle>
          <CardDescription>{accessLabel({ access }, status)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            Pengguna aktif <strong className="tabular-nums">{seats.active}</strong> dari batas{" "}
            <strong className="tabular-nums">{seats.limit}</strong>
            {status === "TRIAL" && " (batas masa gratis)"}.
          </p>
          <p className="text-muted-foreground">
            {status === "TRIAL" && `Masa gratis berakhir ${formatDate(access.until)}. `}
            {status === "ACTIVE" && `Langganan aktif sampai ${formatDate(access.until)}. `}
            {status === "GRACE" &&
              `Masa aktif habis ${formatDate(access.until)}; company dikunci ${formatDate(access.graceUntil)}. `}
            Perpanjangan dihitung dari tanggal berakhir, jadi membayar lebih awal tidak merugikan.
          </p>
        </CardContent>
      </Card>

      {lastRejected && !open && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Pembayaran terakhir ditolak</AlertTitle>
          <AlertDescription>
            {lastRejected.rejectionNote ?? "Bukti tidak bisa diverifikasi."} Silakan pilih lagi dan kirim ulang bukti
            pembayaran.
          </AlertDescription>
        </Alert>
      )}

      {open ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Tagihan berjalan</h2>
          {open.status === "CLAIMED" && (
            <Alert>
              <ClockIcon />
              <AlertTitle>Menunggu verifikasi</AlertTitle>
              <AlertDescription>
                Admin ArchiPay sedang mencocokkan bukti dengan mutasi rekening. Anda akan diberi kabar lewat WhatsApp &
                email.
              </AlertDescription>
            </Alert>
          )}
          <InvoiceCard invoice={open} />
          {open.status === "UNDERPAID" && (
            <PaymentPanel
              title={`Kekurangan ${invoiceLabel(open)} (diterima ${formatRupiah(open.amountPaid)} dari ${formatRupiah(open.price)})`}
              amount={open.price - open.amountPaid}
              payment={payment}
              hidden={{ subscriptionId: open.id }}
            />
          )}
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{status === "ACTIVE" ? "Perpanjang langganan" : "Pilih paket"}</h2>
            <PlanPicker
              pricing={pricing}
              minUsers={minUsers}
              defaultUsers={status === "TRIAL" ? minUsers : Math.max(seats.limit, minUsers)}
              payment={payment}
            />
          </section>
          {canTopup && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Tambah kuota pengguna</h2>
              <p className="text-sm text-muted-foreground">
                Butuh lebih dari {seats.limit} pengguna sebelum masa aktif habis? Bayar selisihnya untuk sisa masa aktif;
                batas naik setelah pembayaran diverifikasi.
              </p>
              <TopupPicker
                pricing={pricing}
                daysLeft={access.daysLeft}
                untilLabel={formatShortDate(access.until)}
                payment={payment}
              />
            </section>
          )}
        </>
      )}

      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Riwayat tagihan</h2>
          {past.map((invoice) => (
            <InvoiceCard key={invoice.id} invoice={invoice} />
          ))}
        </section>
      )}
    </div>
  );
}
