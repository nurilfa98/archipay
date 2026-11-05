// Halaman /subscription (Langganan, khusus Owner / subscription:view):
// status masa aktif & batas pengguna company, tagihan yang sedang berjalan,
// pilihan paket (jumlah pengguna + periode, harga dihitung otomatis), tambah
// kuota pengguna prorata, dan riwayat tagihan (BUSINESS-FLOW §17).
//
// Tetap bisa dibuka saat company terkunci (allowLocked): justru dari sinilah
// Owner memperpanjang. Saat terkunci, menu lain mengarah ke halaman ini.
//
// Setelah Owner memilih paket (langkah bayar), judul halaman, kartu Status,
// dan bagian lain disembunyikan (plan-focus.tsx) supaya fokus ke pembayaran.

import { CircleAlertIcon, ClockIcon, LockIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyStatusBadge } from "@/features/companies/components/company-status-badge";
import { HideWhilePlanFocused, PlanFocusProvider } from "@/features/subscriptions/components/plan-focus";
import { InvoiceCard } from "@/features/subscriptions/components/invoice-card";
import {
  AddonPicker,
  PaymentPanel,
  PlanPicker,
  TopupPicker,
} from "@/features/subscriptions/components/plan-picker";
import { invoiceLabel } from "@/features/subscriptions/labels";
import { minPlanUsers } from "@/features/subscriptions/pricing";
import {
  getCompanyPricing,
  getCompanySubscriptionState,
  listBankAccounts,
  listSubscriptions,
} from "@/features/subscriptions/queries";
import {
  ADDON_KEYS,
  ADDON_LABELS,
  daysUntil,
  isTrialOnly,
  paidAddonDays,
  type AddonCoverage,
  type AddonFlags,
  type AddonKey,
} from "@/lib/addons";
import { requirePermission } from "@/lib/auth/dal";
import { formatShortDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { getPlatformSettings } from "@/lib/platform-settings";
import type { CompanyAccess } from "@/lib/subscription-access";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Langganan",
};

export default function SubscriptionPage() {
  return (
    <PlanFocusProvider>
      <HideWhilePlanFocused>
        <PageHeader
          title="Langganan"
          description="Masa aktif ArchiPay perusahaan Anda, pilihan paket, dan riwayat tagihan."
        />
      </HideWhilePlanFocused>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SubscriptionContent />
      </Suspense>
    </PlanFocusProvider>
  );
}

async function SubscriptionContent() {
  const user = await requirePermission("subscription:view", { allowLocked: true });
  const companyId = user.company.id;
  const [state, { pricing, standard }, banks, settings, history] = await Promise.all([
    getCompanySubscriptionState(companyId),
    getCompanyPricing(companyId),
    listBankAccounts(),
    getPlatformSettings(),
    listSubscriptions({ companyId }),
  ]);
  if (!state) return null;

  const { access, open, lastRejected, seats, addons } = state;
  const status = access.status;
  const payment = { banks, hasQris: !!settings.qrisImageKey };
  const past = history.filter((invoice) => invoice.id !== open?.id);
  const minUsers = minPlanUsers(pricing, seats.active);
  const canTopup = status === "ACTIVE" && access.daysLeft >= 1;
  // Add-on di tengah periode: hanya bila langganan berjalan & add-on itu belum aktif.
  const inactiveAddons = canTopup ? ADDON_KEYS.filter((key) => !addons[key].active) : [];
  const defaultAddons = Object.fromEntries(ADDON_KEYS.map((key) => [key, addons[key].active])) as AddonFlags;
  const addonDays = Object.fromEntries(ADDON_KEYS.map((key) => [key, paidAddonDays(addons[key])])) as Record<
    AddonKey,
    number
  >;

  return (
    <div className="flex flex-col gap-6">
      <HideWhilePlanFocused>
        {access.locked && (
          <Alert variant="destructive">
            <LockIcon />
            <AlertTitle>Akses perusahaan dikunci</AlertTitle>
            <AlertDescription>
              Masa berlangganan habis. Finance & Karyawan tidak bisa masuk, dan menu lain baru terbuka lagi setelah
              pembayaran diverifikasi admin ArchiPay.
            </AlertDescription>
          </Alert>
        )}

        <StatusCard status={status} access={access} seats={seats} addons={addons} />

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
      </HideWhilePlanFocused>

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
              standard={standard}
              minUsers={minUsers}
              defaultUsers={status === "TRIAL" ? minUsers : Math.max(seats.limit, minUsers)}
              defaultAddons={defaultAddons}
              payment={payment}
            />
          </section>
          <HideWhilePlanFocused>
            {inactiveAddons.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Aktifkan add-on</h2>
                <p className="text-sm text-muted-foreground">
                  Untuk semua {seats.limit} pengguna paket, dibayar untuk sisa periode. Menunya terbuka setelah pembayaran
                  diverifikasi.
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  {inactiveAddons.map((key) => (
                    <AddonPicker
                      key={key}
                      addon={key}
                      pricing={pricing}
                      users={seats.limit}
                      days={daysUntil(addons[key].addonEnd)}
                      untilLabel={formatShortDate(addons[key].addonEnd)}
                      payment={payment}
                    />
                  ))}
                </div>
              </section>
            )}
            {canTopup && (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Tambah kuota pengguna</h2>
                <p className="text-sm text-muted-foreground">
                  Butuh lebih dari {seats.limit} pengguna sebelum masa aktif habis? Bayar selisihnya untuk sisa masa aktif;
                  batas naik setelah pembayaran diverifikasi.
                </p>
                <TopupPicker
                  pricing={pricing}
                  standard={standard}
                  daysLeft={access.daysLeft}
                  addonDays={addonDays}
                  untilLabel={formatShortDate(access.until)}
                  payment={payment}
                />
              </section>
            )}
          </HideWhilePlanFocused>
        </>
      )}

      {past.length > 0 && (
        <HideWhilePlanFocused>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Riwayat tagihan</h2>
            {past.map((invoice) => (
              <InvoiceCard key={invoice.id} invoice={invoice} />
            ))}
          </section>
        </HideWhilePlanFocused>
      )}
    </div>
  );
}

// Kartu Status ringkas: masa aktif, pengguna aktif, add-on, masing-masing
// satu kotak. Teks panjang diganti satu catatan singkat.
function StatusCard({
  status,
  access,
  seats,
  addons,
}: {
  status: CompanyAccess["status"];
  access: CompanyAccess;
  seats: { active: number; limit: number };
  addons: Record<AddonKey, AddonCoverage>;
}) {
  const left = access.daysLeft <= 0 ? "berakhir hari ini" : `${access.daysLeft} hari lagi`;
  const period: { label: string; value: string; hint?: string; warn?: boolean } =
    status === "TRIAL"
      ? { label: "Masa gratis s.d.", value: formatShortDate(access.until), hint: left }
      : status === "ACTIVE"
        ? { label: "Aktif s.d.", value: formatShortDate(access.until), hint: left, warn: access.daysLeft <= 7 }
        : status === "GRACE"
          ? {
              label: "Masa aktif habis",
              value: formatShortDate(access.until),
              hint: `Dikunci ${formatShortDate(access.graceUntil)}`,
              warn: true,
            }
          : status === "LOCKED"
            ? { label: "Terkunci sejak", value: formatShortDate(access.graceUntil), warn: true }
            : { label: "Masa aktif s.d.", value: formatShortDate(access.until) };
  const full = seats.active >= seats.limit;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Status
          <CompanyStatusBadge status={status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid gap-3 sm:grid-cols-3">
          <StatusBox label={period.label} value={period.value} hint={period.hint} warn={period.warn} />
          <StatusBox
            label="Pengguna aktif"
            value={`${seats.active} / ${seats.limit}`}
            hint={full ? "Batas penuh" : status === "TRIAL" ? "Batas masa gratis" : "Batas paket"}
            warn={full}
          />
          <div className="flex flex-col gap-1 rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">Add-on</dt>
            {ADDON_KEYS.map((key) => {
              const coverage = addons[key];
              const active = coverage.active && coverage.until;
              return (
                <dd key={key} className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <span className="font-medium">{ADDON_LABELS[key]}</span>
                  <span className={cn("text-xs", active ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                    {active
                      ? `${isTrialOnly(coverage) ? "Gratis" : "Aktif"} s.d. ${formatShortDate(coverage.until!)}`
                      : "Nonaktif"}
                  </span>
                </dd>
              );
            })}
          </div>
        </dl>
        {(status === "TRIAL" || status === "ACTIVE") && (
          <p className="text-xs text-muted-foreground">
            Bayar lebih awal tidak rugi: masa aktif baru dihitung dari tanggal berakhir.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBox({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint && (
        <dd className={cn("text-xs", warn ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {hint}
        </dd>
      )}
    </div>
  );
}
