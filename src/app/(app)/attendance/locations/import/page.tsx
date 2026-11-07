// Halaman /attendance/locations/import: tambah banyak lokasi sekaligus lewat
// klik di peta atau file .xlsx/.csv (Owner & Admin HR).

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkLocationsEditor } from "@/features/attendance/components/bulk-locations-editor";
import { listProjectOptions } from "@/features/attendance/queries";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Tambah Banyak Lokasi",
};

export default function ImportLocationsPage() {
  return (
    <>
      <PageHeader
        title="Tambah banyak lokasi"
        description="Tambah lokasi lewat klik peta atau file Excel, periksa pratinjau, lalu simpan sekaligus."
      />
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <ImportContent />
      </Suspense>
    </>
  );
}

async function ImportContent() {
  const user = await requirePermission("attendance:manage-locations");
  const projects = await listProjectOptions(user.company.id);
  return <BulkLocationsEditor projectNames={projects.map((project) => project.name)} />;
}
