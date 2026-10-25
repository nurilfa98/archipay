// Tombol aksi untuk OWNER/FINANCE di halaman detail: setujui, tolak,
// catat pencairan, dan batalkan. Tombol mana yang tampil ditentukan
// Server Component lewat getAvailableActions() (prop `actions`); Server
// Action mengecek ulang aturan yang sama.

"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  approveAdvance,
  cancelAdvance,
  disburseApprovedAdvance,
  rejectAdvance,
} from "@/features/advances/actions";
import type { AdvanceActions } from "@/features/advances/service";
import { ActionDialog, ReasonField } from "./action-dialog";

export function AdvanceManageActions({
  advanceId,
  actions,
  summary,
  isTransfer,
  wasDisbursed,
}: {
  advanceId: string;
  actions: Pick<AdvanceActions, "decide" | "disburse" | "cancel">;
  summary: string; // "UM-2026-10-0012 · Rp 500.000 untuk Budi"
  isTransfer: boolean;
  wasDisbursed: boolean; // status DISBURSED: karyawan sudah menerima notifikasi
}) {
  const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

  return (
    <div className="flex flex-wrap gap-2">
      {actions.decide && (
        <>
          <ActionDialog
            label="Setujui"
            title="Setujui pengajuan ini?"
            description={`${summary}. Setelah disetujui, serahkan dana lalu tekan “Catat pencairan”.`}
            confirmLabel="Setujui"
            onConfirm={() => approveAdvance(advanceId)}
          />
          <ActionDialog
            label="Tolak"
            variant="outline"
            title="Tolak pengajuan ini?"
            description={summary}
            confirmLabel="Tolak pengajuan"
            onConfirm={(formData) => rejectAdvance(advanceId, text(formData, "reason"))}
          >
            {(fieldError) => (
              <ReasonField
                label="Alasan penolakan"
                placeholder="Contoh: Gunakan sisa uang muka UM-2026-10-0010 terlebih dahulu"
                error={fieldError("reason")}
              />
            )}
          </ActionDialog>
        </>
      )}

      {actions.disburse && (
        <ActionDialog
          label="Catat pencairan"
          title="Dana sudah diserahkan?"
          description={`${summary}. Waktu pencairan dicatat sekarang dan batas unggah nota mulai dihitung. Karyawan menerima WhatsApp untuk konfirmasi.`}
          confirmLabel="Ya, dana sudah diserahkan"
          onConfirm={(formData) => disburseApprovedAdvance(advanceId, text(formData, "transferReference"))}
        >
          {isTransfer
            ? (fieldError) => (
                <Field data-invalid={!!fieldError("transferReference")}>
                  <FieldLabel htmlFor="transferReference">Nomor referensi transfer (opsional)</FieldLabel>
                  <Input id="transferReference" name="transferReference" maxLength={100} autoComplete="off" />
                  <FieldDescription>Dari bukti transfer m-banking.</FieldDescription>
                  <FieldError>{fieldError("transferReference")}</FieldError>
                </Field>
              )
            : undefined}
        </ActionDialog>
      )}

      {actions.cancel && (
        <ActionDialog
          label="Batalkan"
          variant="destructive"
          title="Batalkan uang muka ini?"
          description={
            wasDisbursed
              ? `${summary}. Pastikan dana sudah diterima kembali atau memang belum diserahkan. Karyawan akan diberi tahu lewat WhatsApp.`
              : `${summary}. Uang muka yang dibatalkan tidak bisa diaktifkan kembali.`
          }
          confirmLabel="Batalkan uang muka"
          onConfirm={(formData) => cancelAdvance(advanceId, text(formData, "reason"))}
        >
          {(fieldError) => (
            <ReasonField
              label="Alasan pembatalan"
              placeholder="Contoh: Salah input nominal, seharusnya Rp300.000"
              error={fieldError("reason")}
            />
          )}
        </ActionDialog>
      )}
    </div>
  );
}
