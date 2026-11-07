// Halaman /attendance/locations: daftar lokasi absensi (BUSINESS-FLOW §18.3).
// Owner & Admin HR mengelola (attendance:manage-locations); Superadmin hanya
// melihat (attendance:view-all).

import { MapPinPlusIcon, TablePropertiesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationsList } from "@/features/attendance/components/locations-list";
import { getAttendanceSettings, listLocations } from "@/features/attendance/queries";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Lokasi Absensi",
};

export default function AttendanceLocationsPage() {
  return (
    <>
      <PageHeader
        title="Lokasi absensi"
        description="Kantor, cabang, dan lokasi proyek tempat karyawan absen. Karyawan di dalam radius dianggap berada di lokasi."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <LocationsContent />
      </Suspense>
    </>
  );
}

async function LocationsContent() {
  const user = await requirePermission("attendance:view-all");
  const canManage = can(user, "attendance:manage-locations");
  const [locations, settings] = await Promise.all([
    listLocations(user.company.id),
    getAttendanceSettings(user.company.id),
  ]);

  return (
    <>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/attendance/locations/new" />}>
            <MapPinPlusIcon />
            Tambah lokasi
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/attendance/locations/import" />}>
            <TablePropertiesIcon />
            Impor Excel
          </Button>
        </div>
      )}
      <LocationsList
        locations={locations}
        companyHours={{
          start: settings.workStartMinute,
          end: settings.workEndMinute,
        }}
        readOnly={!canManage}
      />
    </>
  );
}
