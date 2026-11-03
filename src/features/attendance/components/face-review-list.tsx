// Persetujuan foto acuan wajah (Owner & Admin HR) dan status foto semua
// pengguna yang wajib absen. Foto dibuka lewat route berizin
// /api/attendance/faces/<id>/photo (bucket privat).
//
// Tanggal diformat di server (zona waktu perusahaan) lalu dikirim sebagai teks.

"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { ToneBadge } from "@/components/tone-badge";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { ActionDialog, ReasonField } from "@/features/advances/components/action-dialog";
import { approveFaceProfile, rejectFaceProfile } from "../face-actions";

export type FaceReviewRow = {
  userId: string;
  fullName: string;
  email: string;
  roles: Role[];
  consented: boolean;
  approvedAtText: string | null;
  pending: { id: string; createdAtText: string } | null;
  lastRejected: { reason: string | null; reviewedAtText: string | null } | null;
};

export function FaceReviewList({
  rows,
  currentUserId,
  canApprove,
}: {
  rows: FaceReviewRow[];
  currentUserId: string;
  canApprove: boolean;
}) {
  const pending = rows.filter((row) => row.pending);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="pending-faces">
        <h2 id="pending-faces" className="font-medium">
          Menunggu persetujuan ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Tidak ada foto yang menunggu persetujuan.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((row) => (
              <li key={row.userId} className="flex flex-col gap-3 rounded-lg border bg-card p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- file privat lewat route berizin */}
                <img
                  src={`/api/attendance/faces/${row.pending!.id}/photo`}
                  alt={`Foto wajah ${row.fullName}`}
                  className="aspect-[3/4] w-full rounded-md bg-muted object-cover"
                  loading="lazy"
                />
                <div>
                  <p className="font-medium">{row.fullName}</p>
                  <p className="text-sm text-muted-foreground">Dikirim {row.pending!.createdAtText}</p>
                  {row.approvedAtText && (
                    <p className="text-sm text-muted-foreground">Mengganti foto yang disetujui {row.approvedAtText}</p>
                  )}
                </div>
                {canApprove && row.userId !== currentUserId ? (
                  <div className="flex flex-wrap gap-2">
                    <ActionDialog
                      label="Setujui"
                      icon={<CheckIcon />}
                      showLabel
                      title={`Setujui foto wajah ${row.fullName}?`}
                      description="Pastikan foto ini benar wajah orang tersebut. Foto ini menjadi acuan setiap kali ia absen."
                      confirmLabel="Setujui"
                      successMessage={`Foto wajah ${row.fullName} disetujui.`}
                      onConfirm={() => approveFaceProfile(row.pending!.id)}
                    />
                    <ActionDialog
                      label="Tolak"
                      icon={<XIcon />}
                      showLabel
                      variant="destructive"
                      title={`Tolak foto wajah ${row.fullName}?`}
                      description="Foto dihapus dan karyawan diminta mengambil ulang. Alasan ditampilkan kepadanya."
                      confirmLabel="Tolak"
                      successMessage={`Foto wajah ${row.fullName} ditolak.`}
                      onConfirm={(formData) => rejectFaceProfile(row.pending!.id, formData)}
                    >
                      {(fieldError) => (
                        <ReasonField
                          label="Alasan"
                          placeholder="Misal: wajah buram, bukan orang yang bersangkutan"
                          error={fieldError("reason")}
                        />
                      )}
                    </ActionDialog>
                  </div>
                ) : (
                  canApprove && (
                    <p className="text-sm text-muted-foreground">
                      Foto Anda sendiri disetujui oleh Owner atau Admin HR lain.
                    </p>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="all-faces">
        <h2 id="all-faces" className="font-medium">
          Status semua pengguna yang wajib absen ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Belum ada pengguna yang wajib absen.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((row) => {
              const status = faceStatus(row);
              return (
                <li key={row.userId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{row.fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.roles.map((role) => ROLE_LABELS[role]).join(", ")} · {row.email}
                    </p>
                    {row.lastRejected?.reason && (
                      <p className="text-sm text-destructive">Ditolak: {row.lastRejected.reason}</p>
                    )}
                  </div>
                  <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function faceStatus(row: FaceReviewRow): {
  label: string;
  tone: "success" | "active" | "pending" | "warning" | "danger";
} {
  if (row.pending) return { label: "Menunggu persetujuan", tone: "warning" };
  if (row.approvedAtText) return { label: "Siap absen", tone: "success" };
  if (row.lastRejected) return { label: "Ditolak, perlu foto ulang", tone: "danger" };
  if (row.consented) return { label: "Belum kirim foto", tone: "pending" };
  return { label: "Belum mendaftar", tone: "pending" };
}
