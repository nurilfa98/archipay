// Halaman /attendance/locations/new: tambah satu lokasi absensi (Owner & Admin HR).

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationForm } from "@/features/attendance/components/location-form";
import { getAttendanceSettings, listProjectOptions } from "@/features/attendance/queries";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Tambah Lokasi Absensi",
};

export default function NewLocationPage() {
  return (
    <>
      <PageHeader title="Tambah lokasi" description="Lokasi baru langsung bisa dipilih karyawan saat absen." />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
            <NewLocationContent />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function NewLocationContent() {
  const user = await requirePermission("attendance:manage-locations");
  const [projects, settings] = await Promise.all([
    listProjectOptions(user.company.id),
    getAttendanceSettings(user.company.id),
  ]);
  return (
    <LocationForm
      projects={projects}
      companyHours={{
        start: settings.workStartMinute,
        end: settings.workEndMinute,
      }}
    />
  );
}
