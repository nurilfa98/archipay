// Halaman /advances (Uang Muka).
//
// Pola halaman yang terasa ringan dengan Cache Components:
// 1. Bagian STATIS (judul) di luar <Suspense>: ikut di-prefetch, sehingga
//    muncul instan saat menu diklik.
// 2. Bagian yang butuh user (cek permission, data) di dalam <Suspense>:
//    di-stream dari server, dan selama menunggu tampil skeleton.
//
// Cek permission WAJIB ada di setiap halaman, karena menyembunyikan menu di
// sidebar tidak mencegah orang mengetik URL ini langsung.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/streaming.md (bagian "Push dynamic access down")
// - node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md (Step 2)

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Uang Muka",
};

export default function AdvancesPage() {
  return (
    <>
      <PageHeader title="Uang Muka" description="Daftar uang muka yang diberikan kepada karyawan." />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <AdvancesContent />
      </Suspense>
    </>
  );
}

async function AdvancesContent() {
  await requirePermission("advance:view-own");
  // Nanti: ambil data lewat features/advances/queries.ts lalu tampilkan tabelnya.
  return <p className="text-sm text-muted-foreground">Halaman ini sedang dibangun.</p>;
}
