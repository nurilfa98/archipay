// Halaman beranda (/): ringkasan uang muka. Sidebar & navbar sudah
// disediakan oleh (app)/layout.tsx, jadi page cukup berisi konten halaman ini.
//
// Polanya sama dengan halaman lain: judul statis di luar <Suspense>,
// bagian yang membaca user & database di dalamnya.
// Owner/Finance (advance:view-all) melihat seluruh perusahaan, karyawan
// hanya uang muka miliknya sendiri.

import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvanceSummaryCards } from "@/features/advances/components/advance-summary-cards";
import { RecentAdvancesTable } from "@/features/advances/components/recent-advances-table";
import { getAdvanceSummary, listAdvances } from "@/features/advances/queries";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Beranda",
};

const RECENT_LIMIT = 5;

export default function HomePage() {
  return (
    <>
      <PageHeader title="Selamat datang di ArchiPay" description="Ringkasan uang muka." />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const user = await verifySession();
  if (!can(user, "advance:view-own")) return null;

  const viewAll = can(user, "advance:view-all");
  const recipientId = viewAll ? undefined : user.id;
  const [summary, recent] = await Promise.all([
    getAdvanceSummary({ recipientId }),
    listAdvances({ recipientId, limit: RECENT_LIMIT }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdvanceSummaryCards summary={summary} />
      <section className="flex flex-col gap-2" aria-labelledby="recent-advances-title">
        <div className="flex items-center justify-between gap-2">
          <h2 id="recent-advances-title" className="text-sm font-medium">
            Uang muka terbaru
          </h2>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/advances" />}>
            Lihat semua
            <ArrowRightIcon />
          </Button>
        </div>
        <RecentAdvancesTable advances={recent} showRecipient={viewAll} />
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
