// Halaman /settlements. Polanya sama dengan (app)/advances/page.tsx:
// judul statis di luar <Suspense>, cek permission & data di dalamnya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Pertanggungjawaban",
};

export default function SettlementsPage() {
  return (
    <>
      <PageHeader
        title="Pertanggungjawaban"
        description="Laporan penggunaan uang muka beserta nota belanja."
      />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <SettlementsContent />
      </Suspense>
    </>
  );
}

async function SettlementsContent() {
  await requirePermission("settlement:submit");
  return <p className="text-sm text-muted-foreground">Halaman ini sedang dibangun.</p>;
}
