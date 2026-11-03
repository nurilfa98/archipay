// Halaman /attendance/locations/[id]/edit: ubah lokasi absensi (Owner & Admin HR).
// params (Promise) baru di-await di dalam <Suspense> agar kerangka halaman
// tetap statis.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationForm } from "@/features/attendance/components/location-form";
import { getAttendanceSettings, getLocation, listProjectOptions } from "@/features/attendance/queries";
import { idSchema } from "@/features/attendance/schemas";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Ubah Lokasi Absensi",
};

export default function EditLocationPage({ params }: PageProps<"/attendance/locations/[id]/edit">) {
  return (
    <>
      <PageHeader
        title="Ubah lokasi"
        description="Perubahan titik, radius, dan jam kerja berlaku untuk absen berikutnya."
      />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
            <EditLocationContent params={params} />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function EditLocationContent({ params }: Pick<PageProps<"/attendance/locations/[id]/edit">, "params">) {
  const user = await requirePermission("attendance:manage-locations");
  const parsed = idSchema.safeParse((await params).id);
  const location = parsed.success ? await getLocation(user.company.id, parsed.data) : null;
  if (!location) notFound();

  const [projects, settings] = await Promise.all([
    listProjectOptions(user.company.id),
    getAttendanceSettings(user.company.id),
  ]);
  return (
    <LocationForm
      location={location}
      projects={projects}
      companyHours={{
        start: settings.workStartMinute,
        end: settings.workEndMinute,
      }}
    />
  );
}
