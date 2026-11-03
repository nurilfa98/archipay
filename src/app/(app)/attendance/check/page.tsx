// Halaman /attendance/check: absen masuk / pulang dengan GPS + selfie
// (BUSINESS-FLOW §18.5–18.7). Untuk pengguna yang wajib absen dan foto acuan
// wajahnya sudah disetujui.

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckFlow } from "@/features/attendance/components/check-flow";
import { getApprovedFace, hasConsent } from "@/features/attendance/queries";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Absen",
};

export default function CheckPage() {
  return (
    <>
      <PageHeader title="Absen" description="Jam absen memakai jam server di zona waktu lokasi, bukan jam HP." />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <CheckContent />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function CheckContent() {
  const user = await requirePermission("attendance:check-in");
  const [consented, face] = await Promise.all([hasConsent(user.id), getApprovedFace(user.company.id, user.id)]);
  if (!consented || !face) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {consented
            ? "Foto acuan wajah Anda belum disetujui Owner atau Admin HR."
            : "Daftarkan foto acuan wajah Anda dulu sebelum bisa absen."}
        </p>
        <Button nativeButton={false} render={<Link href="/attendance" />}>
          Ke menu Absensi
        </Button>
      </div>
    );
  }
  return <CheckFlow />;
}
