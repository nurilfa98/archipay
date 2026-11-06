// Halaman /attendance/faces: persetujuan foto acuan wajah dan status foto
// semua pengguna yang wajib absen (BUSINESS-FLOW §18.4). Owner & Admin HR
// menyetujui (attendance:approve-face); Superadmin hanya melihat.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { FaceReviewList } from "@/features/attendance/components/face-review-list";
import { listFaceOverview } from "@/features/attendance/queries";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Foto Wajah",
};

export default function FacesPage() {
  return (
    <>
      <PageHeader
        title="Foto acuan wajah"
        description="Cocokkan foto dengan orangnya sebelum menyetujui. Foto yang disetujui menjadi acuan setiap kali ia absen."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FacesContent />
      </Suspense>
    </>
  );
}

async function FacesContent() {
  const user = await requirePermission("attendance:view-all");
  const overview = await listFaceOverview(user.company.id);
  return (
    <FaceReviewList
      currentUserId={user.id}
      canApprove={can(user, "attendance:approve-face")}
      rows={overview.map((row) => ({
        userId: row.userId,
        fullName: row.fullName,
        email: row.email,
        roles: row.roles,
        consented: row.consented,
        approvedPhotoId: row.approvedId,
        approvedAtText: row.approvedId ? (row.approvedAt ? formatDateTime(row.approvedAt) : "-") : null,
        pending: row.pending
          ? {
              id: row.pending.id,
              createdAtText: formatDateTime(row.pending.createdAt),
            }
          : null,
        lastRejected: row.lastRejected
          ? {
              reason: row.lastRejected.reason,
              reviewedAtText: row.lastRejected.reviewedAt ? formatDateTime(row.lastRejected.reviewedAt) : null,
            }
          : null,
      }))}
    />
  );
}
