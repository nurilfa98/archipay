// Kartu "Foto yang diajukan" di menu Absensi (karyawan), di bawah kartu "Foto
// acuan wajah Anda": foto terbaru yang dikirim, statusnya, dan bila ditolak,
// alasan beserta saran perbaikannya (BUSINESS-FLOW §18.4). Server Component.
//
// Tampil bila foto menunggu persetujuan atau ditolak. Penolakan hilang saat
// karyawan mengambil ulang foto; bila ia masih punya foto acuan yang disetujui,
// kartu penolakan hanya tampil FACE_REJECT_NOTICE_DAYS hari (showFaceSubmission).

import { CircleAlertIcon, ClockIcon, ImageOffIcon, ScanFaceIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { FilePreview } from "@/components/file-preview";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { splitFaceRejection } from "../constants";
import type { FaceProfileSummary } from "../queries";

const PHOTO_SIZE = "size-[127px] sm:size-[143px]";

export function FaceSubmissionCard({
  submission,
  hasApproved,
}: {
  submission: FaceProfileSummary;
  hasApproved: boolean;
}) {
  const rejected = submission.status === "REJECTED";
  const rejection = rejected ? splitFaceRejection(submission.rejectCode, submission.rejectReason) : null;
  const photoUrl = `/api/attendance/faces/${submission.id}/photo`;

  return (
    <Card className={rejected ? "ring-rose-200 dark:ring-rose-900" : undefined}>
      <CardHeader>
        <CardTitle>Foto yang diajukan</CardTitle>
        <CardDescription>
          {rejected ? "Foto ini ditolak. Alasannya ada di bawah." : "Menunggu pemeriksaan Owner atau Admin HR."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {submission.hasPhoto ? (
            <FilePreview
              src={photoUrl}
              isPdf={false}
              title="Foto wajah yang Anda ajukan"
              className={`group block ${PHOTO_SIZE} shrink-0 cursor-zoom-in overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- file privat lewat route berizin */}
              <img
                src={photoUrl}
                alt="Foto wajah yang Anda ajukan"
                className="size-full bg-muted object-cover object-[50%_30%] transition-transform duration-200 group-hover:scale-105"
              />
            </FilePreview>
          ) : (
            <div
              className={`flex ${PHOTO_SIZE} shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-muted/50 p-2 text-center text-xs text-muted-foreground`}
            >
              <ImageOffIcon className="size-5" />
              Foto sudah dihapus
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
            {rejected ? (
              <ToneBadge tone="danger">Ditolak</ToneBadge>
            ) : (
              <ToneBadge tone="warning">Menunggu persetujuan</ToneBadge>
            )}
            <div className="flex flex-col gap-1.5">
              <DateLine label="Dikirim" value={formatDateTime(submission.createdAt)} />
              {rejected && submission.reviewedAt && (
                <DateLine label="Ditolak" value={formatDateTime(submission.reviewedAt)} />
              )}
            </div>
          </div>
        </div>

        {rejection ? (
          <div className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <p className="flex items-start gap-2 font-medium">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
              {rejection.title}
            </p>
            {rejection.note && (
              <blockquote className="border-l-2 border-rose-300 pl-3 text-sm dark:border-rose-800">
                {rejection.note}
              </blockquote>
            )}
            {rejection.hint && <p className="text-sm opacity-90">{rejection.hint}</p>}
          </div>
        ) : (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ClockIcon className="mt-0.5 size-4 shrink-0" />
            Anda masih bisa mengambil ulang foto selama belum diperiksa.
          </p>
        )}

        {hasApproved && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            Foto acuan lama Anda tetap dipakai untuk absen.
          </p>
        )}

        <Button
          variant={rejected && !hasApproved ? "brand" : "outline"}
          className="w-full sm:w-auto sm:self-start"
          nativeButton={false}
          render={<Link href="/attendance/enroll" />}
        >
          <ScanFaceIcon />
          Ambil ulang foto
        </Button>
      </CardContent>
    </Card>
  );
}

function DateLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
