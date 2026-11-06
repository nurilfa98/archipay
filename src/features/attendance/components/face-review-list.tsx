// Persetujuan foto acuan wajah (Owner & Admin HR) dan status foto semua
// pengguna yang wajib absen. Foto dibuka lewat route berizin
// /api/attendance/faces/<id>/photo (bucket privat).
//
// Tanggal diformat di server (zona waktu perusahaan) lalu dikirim sebagai teks.
//
// Bagian "Status pengguna wajib absen": filter status (chip), pencarian
// nama/email, dan daftar dengan yang perlu ditindaklanjuti di atas.

"use client";

import {
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  ScanFaceIcon,
  SearchIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { FilePreview } from "@/components/file-preview";
import { ToneBadge } from "@/components/tone-badge";
import { Input } from "@/components/ui/input";
import { RoleBadges } from "@/features/users/components/user-badges";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { ActionDialog, ReasonField } from "@/features/advances/components/action-dialog";
import { approveFaceProfile, rejectFaceProfile } from "../face-actions";
import { PersonAvatar } from "./person-avatar";

export type FaceReviewRow = {
  userId: string;
  fullName: string;
  email: string;
  roles: Role[];
  consented: boolean;
  approvedPhotoId: string | null; // id foto acuan yang disetujui (untuk avatar)
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
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6">
            {pending.map((row) => (
              <li key={row.userId} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-2">
                {/* Klik foto → pratinjau mengambang (components/file-preview.tsx). */}
                <FilePreview
                  src={`/api/attendance/faces/${row.pending!.id}/photo`}
                  isPdf={false}
                  title={`Foto wajah ${row.fullName}`}
                  className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- file privat lewat route berizin */}
                  <img
                    src={`/api/attendance/faces/${row.pending!.id}/photo`}
                    alt={`Foto wajah ${row.fullName}`}
                    className="aspect-square w-full bg-muted object-cover object-[50%_30%] transition-transform duration-200 group-hover:scale-105"
                    loading="lazy"
                  />
                </FilePreview>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={row.fullName}>
                    {row.fullName}
                  </p>
                  <p className="text-xs text-muted-foreground">Dikirim {row.pending!.createdAtText}</p>
                  {row.approvedAtText && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      Mengganti foto yang disetujui {row.approvedAtText}
                    </p>
                  )}
                </div>
                {canApprove && row.userId !== currentUserId ? (
                  <div className="mt-auto grid grid-cols-2 gap-1.5">
                    <ActionDialog
                      label="Setujui"
                      size="sm"
                      className="w-full"
                      title={`Setujui foto wajah ${row.fullName}?`}
                      description="Pastikan foto ini benar wajah orang tersebut. Foto ini menjadi acuan setiap kali ia absen."
                      confirmLabel="Setujui"
                      successMessage={`Foto wajah ${row.fullName} disetujui.`}
                      onConfirm={() => approveFaceProfile(row.pending!.id)}
                    />
                    <ActionDialog
                      label="Tolak"
                      size="sm"
                      className="w-full"
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
                    <p className="text-xs text-muted-foreground">
                      Foto Anda sendiri disetujui oleh Owner atau Admin HR lain.
                    </p>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <FaceStatusSection rows={rows} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status semua pengguna yang wajib absen
// ---------------------------------------------------------------------------

type StatusKey = "READY" | "PENDING" | "REJECTED" | "NO_PHOTO" | "NOT_REGISTERED";
type Tone = "success" | "active" | "pending" | "warning" | "danger";
type Filter = "ALL" | "READY" | "PENDING" | "REJECTED" | "TODO";

const STATUS: Record<
  StatusKey,
  { label: string; tone: Tone; icon: LucideIcon; group: Exclude<Filter, "ALL">; avatar: string }
> = {
  READY: {
    label: "Siap absen",
    tone: "success",
    icon: CircleCheckIcon,
    group: "READY",
    avatar: "bg-emerald-100 text-emerald-700 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800",
  },
  PENDING: {
    label: "Menunggu persetujuan",
    tone: "warning",
    icon: ClockIcon,
    group: "PENDING",
    avatar: "bg-amber-100 text-amber-700 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800",
  },
  REJECTED: {
    label: "Ditolak, perlu foto ulang",
    tone: "danger",
    icon: CircleXIcon,
    group: "REJECTED",
    avatar: "bg-rose-100 text-rose-700 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800",
  },
  NO_PHOTO: {
    label: "Belum kirim foto",
    tone: "pending",
    icon: ScanFaceIcon,
    group: "TODO",
    avatar: "bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600",
  },
  NOT_REGISTERED: {
    label: "Belum mendaftar",
    tone: "pending",
    icon: UserRoundXIcon,
    group: "TODO",
    avatar: "bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600",
  },
};

const FILTERS: { key: Filter; label: string; icon?: LucideIcon; active: string }[] = [
  { key: "ALL", label: "Semua", active: "border-brand bg-brand/10 text-brand" },
  {
    key: "READY",
    label: "Siap absen",
    icon: CircleCheckIcon,
    active: "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  {
    key: "PENDING",
    label: "Menunggu",
    icon: ClockIcon,
    active: "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  {
    key: "REJECTED",
    label: "Ditolak",
    icon: CircleXIcon,
    active: "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  },
  {
    key: "TODO",
    label: "Belum kirim foto",
    icon: ScanFaceIcon,
    active: "border-slate-500 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
];

// Urutan tampil di "Semua": yang perlu ditindaklanjuti dulu, yang sudah siap terakhir.
const PRIORITY: Record<StatusKey, number> = { REJECTED: 0, NOT_REGISTERED: 1, NO_PHOTO: 2, PENDING: 3, READY: 4 };

function statusKey(row: FaceReviewRow): StatusKey {
  if (row.pending) return "PENDING";
  if (row.approvedAtText) return "READY";
  if (row.lastRejected) return "REJECTED";
  return row.consented ? "NO_PHOTO" : "NOT_REGISTERED";
}

// Keterangan satu baris di bawah email.
function statusDetail(row: FaceReviewRow, key: StatusKey) {
  switch (key) {
    case "READY":
      return row.approvedAtText && row.approvedAtText !== "-" ? `Disetujui ${row.approvedAtText}` : "Foto acuan disetujui";
    case "PENDING":
      return `Foto dikirim ${row.pending!.createdAtText}`;
    case "REJECTED":
      return row.lastRejected?.reviewedAtText ? `Ditolak ${row.lastRejected.reviewedAtText}` : "Foto ditolak";
    case "NO_PHOTO":
      return "Sudah menyetujui pernyataan data, belum mengirim foto.";
    case "NOT_REGISTERED":
      return "Belum menyetujui pernyataan data wajah & lokasi.";
  }
}

function FaceStatusSection({ rows }: { rows: FaceReviewRow[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");

  const items = rows.map((row) => ({ row, key: statusKey(row) }));
  const count = (target: Filter) =>
    target === "ALL" ? items.length : items.filter((item) => STATUS[item.key].group === target).length;

  const needle = query.trim().toLowerCase();
  const visible = items
    .filter((item) => filter === "ALL" || STATUS[item.key].group === filter)
    .filter(
      (item) =>
        !needle || item.row.fullName.toLowerCase().includes(needle) || item.row.email.toLowerCase().includes(needle),
    )
    .toSorted(
      (a, b) => PRIORITY[a.key] - PRIORITY[b.key] || a.row.fullName.localeCompare(b.row.fullName, "id"),
    );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="all-faces">
      <h2 id="all-faces" className="font-medium">
        Status pengguna wajib absen ({items.length})
      </h2>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Belum ada pengguna yang wajib absen.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Saring status foto wajah">
              {FILTERS.map(({ key, label, icon: Icon, active }) => {
                const selected = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFilter(key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? active : "bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {Icon && <Icon className="size-3.5" />}
                    {label}
                    <span className="tabular-nums opacity-70">{count(key)}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative w-full sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama atau email"
                aria-label="Cari pengguna"
                className="pl-8"
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Tidak ada pengguna pada filter ini.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {visible.map(({ row, key }) => {
                const status = STATUS[key];
                const StatusIcon = status.icon;
                return (
                  <li key={row.userId} className="flex items-start gap-3 p-3 sm:p-4">
                    <PersonAvatar
                      name={row.fullName}
                      photoId={key === "READY" ? row.approvedPhotoId : null}
                      className={cn("mt-0.5", status.avatar)}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium">{row.fullName}</span>
                            <RoleBadges roles={row.roles} />
                          </div>
                          <p className="truncate text-sm text-muted-foreground">{row.email}</p>
                        </div>
                        <ToneBadge tone={status.tone} className="shrink-0">
                          <StatusIcon />
                          {status.label}
                        </ToneBadge>
                      </div>
                      <p className="text-xs text-muted-foreground">{statusDetail(row, key)}</p>
                      {key === "REJECTED" && row.lastRejected?.reason && (
                        <p className="mt-1 rounded-md bg-rose-50 px-2.5 py-1.5 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                          <span className="font-medium">Alasan ditolak:</span> {row.lastRejected.reason}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
