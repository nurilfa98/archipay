// Halaman /attendance/enroll: persetujuan data (UU PDP) lalu ambil selfie
// acuan wajah (BUSINESS-FLOW §18.4). Untuk pengguna yang wajib absen.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConsentForm } from "@/features/attendance/components/consent-form";
import { FaceCapture } from "@/features/attendance/components/face-capture";
import { consentStatement } from "@/features/attendance/constants";
import { hasConsent } from "@/features/attendance/queries";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Daftar Foto Wajah",
};

export default function EnrollFacePage() {
  return (
    <>
      <PageHeader
        title="Daftar foto wajah"
        description="Foto acuan untuk absen. Setelah dikirim, Owner atau Admin HR memeriksanya."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <EnrollContent />
      </Suspense>
    </>
  );
}

async function EnrollContent() {
  const user = await requirePermission("attendance:check-in");

  if (!(await hasConsent(user.id))) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Persetujuan data wajah & lokasi</CardTitle>
          <CardDescription>Wajib disetujui sekali sebelum memakai absensi.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConsentForm statement={consentStatement(user.fullName, user.company.name)} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <FaceCapture />
      </CardContent>
    </Card>
  );
}
