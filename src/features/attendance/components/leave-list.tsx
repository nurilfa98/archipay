// Daftar pengajuan cuti/izin (BUSINESS-FLOW §19): milik sendiri (bisa
// dibatalkan) dan milik semua orang untuk Owner/Admin HR (setujui/tolak).
// Teks tanggal & status disiapkan server; komponen ini hanya menampilkan dan
// memanggil Server Action.

"use client";

import { CheckIcon, PaperclipIcon, XIcon } from "lucide-react";
import { ToneBadge, type Tone } from "@/components/tone-badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog, ReasonField } from "@/features/advances/components/action-dialog";
import { approveLeave, cancelLeave, rejectLeave } from "../leave-actions";

export type LeaveListRow = {
  id: string;
  number: string;
  userName: string;
  typeName: string;
  periodText: string;
  reason: string;
  statusLabel: string;
  tone: Tone;
  paid: boolean;
  hasAttachment: boolean;
  decidedText: string | null;
  rejectReason: string | null;
  // Owner/Admin HR
  canDecide: boolean;
  decideHint: string | null;
  // Pengaju
  cancel: null | { kind: "whole" } | { kind: "from-date"; min: string; max: string; defaultValue: string };
};

export function LeaveList({
  rows,
  showName,
  emptyText,
}: {
  rows: LeaveListRow[];
  showName: boolean;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                {showName ? `${row.userName} · ` : ""}
                {row.typeName}
              </p>
              <p className="text-sm text-muted-foreground">
                {row.number} · {row.periodText}
                {row.paid ? "" : " · tidak dibayar"}
              </p>
            </div>
            <ToneBadge tone={row.tone}>{row.statusLabel}</ToneBadge>
          </div>
          <p className="text-sm">Alasan: {row.reason}</p>
          {row.hasAttachment && (
            <a
              href={`/api/attendance/leave/${row.id}/attachment`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 text-sm text-brand hover:underline"
            >
              <PaperclipIcon className="size-3.5" />
              Lihat lampiran
            </a>
          )}
          {row.decidedText && <p className="text-sm text-muted-foreground">{row.decidedText}</p>}
          {row.rejectReason && <p className="text-sm text-destructive">Alasan ditolak: {row.rejectReason}</p>}
          {row.decideHint && <p className="text-sm text-muted-foreground">{row.decideHint}</p>}

          {(row.canDecide || row.cancel) && (
            <div className="flex flex-wrap gap-2">
              {row.canDecide && (
                <>
                  <ActionDialog
                    label="Setujui"
                    icon={<CheckIcon />}
                    showLabel
                    title={`Setujui ${row.typeName} ${row.userName}?`}
                    description={`${row.number} · ${row.periodText}. Karyawan menerima kabar lewat WhatsApp.`}
                    confirmLabel="Setujui"
                    successMessage={`${row.number} disetujui.`}
                    onConfirm={() => approveLeave(row.id)}
                  />
                  <ActionDialog
                    label="Tolak"
                    icon={<XIcon />}
                    showLabel
                    variant="destructive"
                    title={`Tolak ${row.typeName} ${row.userName}?`}
                    description="Alasan dikirim ke karyawan lewat WhatsApp."
                    confirmLabel="Tolak"
                    successMessage={`${row.number} ditolak.`}
                    onConfirm={(formData) => rejectLeave(row.id, formData)}
                  >
                    {(fieldError) => (
                      <ReasonField
                        label="Alasan"
                        placeholder="Misal: proyek sedang padat"
                        error={fieldError("reason")}
                      />
                    )}
                  </ActionDialog>
                </>
              )}
              {row.cancel && (
                <ActionDialog
                  label="Batalkan"
                  showLabel
                  variant="outline"
                  title={`Batalkan ${row.number}?`}
                  description={
                    row.cancel.kind === "whole"
                      ? "Pengajuan dibatalkan seluruhnya."
                      : "Hari yang belum lewat bisa dibatalkan, misal karena ternyata masuk kerja. Kuota cuti kembali dan Owner diberi tahu."
                  }
                  confirmLabel="Batalkan pengajuan"
                  successMessage={`${row.number} dibatalkan.`}
                  onConfirm={(formData) => cancelLeave(row.id, String(formData.get("fromDate") ?? ""))}
                >
                  {row.cancel.kind === "from-date"
                    ? () => {
                        const range = row.cancel as Extract<LeaveListRow["cancel"], { kind: "from-date" }>;
                        return (
                          <Field>
                            <FieldLabel htmlFor={`from-${row.id}`}>Batalkan mulai tanggal</FieldLabel>
                            <Input
                              id={`from-${row.id}`}
                              name="fromDate"
                              type="date"
                              min={range.min}
                              max={range.max}
                              defaultValue={range.defaultValue}
                              required
                            />
                            <FieldDescription>Tanggal ini sampai tanggal selesai dibatalkan.</FieldDescription>
                          </Field>
                        );
                      }
                    : undefined}
                </ActionDialog>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
