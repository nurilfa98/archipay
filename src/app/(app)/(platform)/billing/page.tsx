// Halaman /billing (Tagihan, Superadmin / subscription:manage): kotak masuk
// tagihan langganan SEMUA company (BUSINESS-FLOW §17).
//
//   /billing                  Menunggu verifikasi (bawaan): ada bukti yang perlu dicek
//   /billing?status=UNDERPAID Kurang bayar: menunggu Owner melengkapi
//   /billing?status=ALL       Riwayat semua tagihan
//
// Tiap pembayaran yang menunggu punya tombol Terima / Tolak. Bukti dibuka di
// tab baru. Tagihan per company juga tampil di detail company → Langganan.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceCard } from "@/features/subscriptions/components/invoice-card";
import type { SubscriptionStatus } from "@/features/subscriptions/constants";
import { listSubscriptions } from "@/features/subscriptions/queries";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Tagihan",
};

type Tab = { value: string; label: string; statuses: readonly SubscriptionStatus[]; empty: string };

const TABS: Tab[] = [
  { value: "CLAIMED", label: "Menunggu verifikasi", statuses: ["CLAIMED"], empty: "Tidak ada pembayaran yang menunggu verifikasi." },
  { value: "UNDERPAID", label: "Kurang bayar", statuses: ["UNDERPAID"], empty: "Tidak ada tagihan kurang bayar." },
  { value: "ALL", label: "Riwayat", statuses: [], empty: "Belum ada tagihan." },
];

export default function BillingPage({ searchParams }: PageProps<"/billing">) {
  return (
    <>
      <PageHeader
        title="Tagihan"
        description="Pembayaran langganan semua company. Cocokkan bukti dengan mutasi rekening sebelum menerima."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        {searchParams.then((params) => (
          <BillingContent tab={TABS.find((tab) => tab.value === params.status) ?? TABS[0]} />
        ))}
      </Suspense>
    </>
  );
}

async function BillingContent({ tab }: { tab: Tab }) {
  const user = await requirePlatformAdmin();
  if (!can(user, "subscription:manage")) redirect("/companies");
  const invoices = await listSubscriptions({ statuses: tab.statuses });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring tagihan">
        {TABS.map((item) => (
          <Link
            key={item.value}
            href={item.value === "CLAIMED" ? "/billing" : `/billing?status=${item.value}`}
            aria-current={item.value === tab.value ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors",
              item.value === tab.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {invoices.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tab.empty}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {invoices.map((invoice) => (
            <InvoiceCard key={invoice.id} invoice={invoice} admin showCompany />
          ))}
        </div>
      )}
    </div>
  );
}
