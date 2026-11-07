// Daftar lembur di hari libur (BUSINESS-FLOW §24): milik sendiri (bisa dibatalkan,
// atau "Tidak bisa hadir" untuk penugasan) dan milik semua orang untuk Owner/Admin HR
// (setujui/tolak/batalkan). Teks tanggal & status disiapkan server; komponen ini hanya
// menampilkan dan memanggil Server Action.

"use client";

import { CalendarDaysIcon, CheckIcon, ClockIcon, UserRoundCheckIcon, XIcon } from "lucide-react";
import { ToneBadge, type Tone } from "@/components/tone-badge";
import { ActionDialog, ReasonField } from "@/features/advances/components/action-dialog";
import { approveOvertime, cancelOvertime, declineOvertime, rejectOvertime } from "../overtime-actions";
import { PersonAvatar } from "./person-avatar";

export type OvertimeListRow = {
  id: string;
  userName: string;
  photoId: string | null; // foto acuan wajah yang disetujui (avatar), bila ada
  dateText: string;
  timeText: string;
  reason: string;
  sourceText: string; // "Diajukan karyawan" / "Ditugaskan Budi"
  statusLabel: string;
  tone: Tone;
  decidedText: string | null;
  rejectReason: string | null;
  declineReason: string | null;
  // Jam lembur terhitung dari absen tertaut ("Terhitung 4 jam"); null = belum ada absen.
  workedText: string | null;
  // Owner/Admin HR
  canDecide: boolean;
  decideHint: string | null;
  // Pembatalan (pengaju, atau Owner/Admin HR)
  canCancel: boolean;
  // Penugasan untuk saya: boleh menolak
  canDecline: boolean;
};

export function OvertimeList({
  rows,
  showName,
  emptyText,
}: {
  rows: OvertimeListRow[];
  showName: boolean;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:p-4">
          <div className="flex items-start gap-3">
            {showName ? (
              <PersonAvatar name={row.userName} photoId={row.photoId} />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <CalendarDaysIcon className="size-5" />
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="truncate font-medium">{showName ? row.userName : row.dateText}</p>
                <p className="truncate text-sm text-muted-foreground">{showName ? row.dateText : row.sourceText}</p>
              </div>
              <ToneBadge tone={row.tone} className="shrink-0">
                {row.statusLabel}
              </ToneBadge>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-4 shrink-0" />
              {row.timeText}
            </span>
            {showName && (
              <span className="inline-flex items-center gap-1.5">
                <UserRoundCheckIcon className="size-4 shrink-0" />
                {row.sourceText}
              </span>
            )}
            {row.workedText && <span className="font-medium text-foreground">{row.workedText}</span>}
          </div>

          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Keterangan: </span>
            {row.reason}
          </p>
          {row.decidedText && <p className="text-sm text-muted-foreground">{row.decidedText}</p>}
          {row.rejectReason && <p className="text-sm text-destructive">Alasan ditolak: {row.rejectReason}</p>}
          {row.declineReason && (
            <p className="text-sm text-destructive">Alasan tidak bisa hadir: {row.declineReason}</p>
          )}
          {row.decideHint && <p className="text-sm text-muted-foreground">{row.decideHint}</p>}

          {(row.canDecide || row.canCancel || row.canDecline) && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {row.canDecide && (
                <>
                  <ActionDialog
                    label="Setujui"
                    icon={<CheckIcon />}
                    showLabel
                    title={`Setujui lembur ${row.userName}?`}
                    description={`${row.dateText} · ${row.timeText}. Karyawan baru bisa absen di hari libur itu setelah disetujui.`}
                    confirmLabel="Setujui"
                    successMessage="Lembur disetujui."
                    onConfirm={() => approveOvertime(row.id)}
                  />
                  <ActionDialog
                    label="Tolak"
                    icon={<XIcon />}
                    showLabel
                    variant="destructive"
                    title={`Tolak lembur ${row.userName}?`}
                    description="Alasan penolakan ditampilkan kepada karyawan."
                    confirmLabel="Tolak"
                    successMessage="Lembur ditolak."
                    onConfirm={(formData) => rejectOvertime(row.id, formData)}
                  >
                    {(fieldError) => (
                      <ReasonField
                        label="Alasan"
                        placeholder="Misal: pekerjaan bisa diselesaikan di hari kerja"
                        error={fieldError("reason")}
                      />
                    )}
                  </ActionDialog>
                </>
              )}
              {row.canDecline && (
                <ActionDialog
                  label="Tidak bisa hadir"
                  showLabel
                  variant="outline"
                  title="Tidak bisa hadir lembur?"
                  description={`${row.dateText} · ${row.timeText}. Owner dan Admin HR melihat alasan Anda.`}
                  confirmLabel="Kirim"
                  successMessage="Terkirim. Anda tidak bisa absen di tanggal itu."
                  onConfirm={(formData) => declineOvertime(row.id, formData)}
                >
                  {(fieldError) => (
                    <ReasonField label="Alasan" placeholder="Misal: ada acara keluarga" error={fieldError("reason")} />
                  )}
                </ActionDialog>
              )}
              {row.canCancel && (
                <ActionDialog
                  label="Batalkan"
                  showLabel
                  variant="outline"
                  title="Batalkan lembur ini?"
                  description={`${row.dateText} · ${row.timeText}. Karyawan tidak bisa absen di hari libur itu lagi.`}
                  confirmLabel="Batalkan lembur"
                  successMessage="Lembur dibatalkan."
                  onConfirm={() => cancelOvertime(row.id)}
                />
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
