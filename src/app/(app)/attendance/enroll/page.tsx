// Halaman /attendance/enroll: persetujuan data (UU PDP) lalu ambil selfie
// acuan wajah (BUSINESS-FLOW §18.4). Untuk pengguna yang wajib absen.

import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConsentForm } from "@/features/attendance/components/consent-form";
import { FaceCapture } from "@/features/attendance/components/face-capture";
import { consentStatement, faceChangeLockedUntil } from "@/features/attendance/constants";
import { getMyFaceProfiles, hasConsent } from "@/features/attendance/queries";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/dates";

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

  // Batas ganti foto acuan: sekali seminggu (dicek ulang di submitFaceProfile).
  const faces = await getMyFaceProfiles(user.company.id, user.id);
  await io();
  const lockedUntil = faceChangeLockedUntil(faces.approved, faces.latest, new Date());
  if (lockedUntil) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Foto acuan belum bisa diganti</CardTitle>
          <CardDescription>
            Foto acuan hanya bisa diganti sekali seminggu. Anda bisa menggantinya lagi mulai{" "}
            {formatDateTime(lockedUntil)}.
          </CardDescription>
        </CardHeader>
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
