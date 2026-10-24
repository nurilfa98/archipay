// Halaman /audit (khusus OWNER). Polanya sama dengan (app)/advances/page.tsx:
// judul statis di luar <Suspense>, cek permission & data di dalamnya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Audit Log",
};

export default function AuditPage() {
  return (
    <>
      <PageHeader title="Audit Log" description="Riwayat aktivitas: siapa melakukan apa dan kapan." />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <AuditContent />
      </Suspense>
    </>
  );
}

async function AuditContent() {
  await requirePermission("audit:view");
  return <p className="text-sm text-muted-foreground">Halaman ini sedang dibangun.</p>;
}
