// Tombol "Kirim pertanggungjawaban" (karyawan) dengan dialog konfirmasi.
// Setelah dikirim, nota terkunci sampai diverifikasi atau dikembalikan.
//
// Bila pengiriman melewati batas unggah nota (isLate), dialog juga meminta
// alasan keterlambatan. Server tetap mengecek ulang dengan waktu sendiri.

"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { submitSettlement } from "@/features/settlements/actions";
import { formatRupiah } from "@/lib/format";

export function SettlementSubmitButton({
  settlementId,
  itemCount,
  itemTotal,
  advanceAmount,
  isResubmission,
  isLate,
}: {
  settlementId: string;
  itemCount: number;
  itemTotal: number;
  advanceAmount: number;
  isResubmission: boolean;
  isLate: boolean; // sudah lewat batas unggah nota
}) {
  const balance = advanceAmount - itemTotal;
  const result =
    balance > 0
      ? `Bila semua nota disetujui, sisa ${formatRupiah(balance)} wajib Anda kembalikan.`
      : balance < 0
        ? `Bila semua nota disetujui, kantor akan mengganti kekurangan ${formatRupiah(-balance)}.`
        : "Total nota sama dengan dana yang diterima.";

  return (
    <ActionDialog
      label={isResubmission ? "Kirim ulang" : "Kirim pertanggungjawaban"}
      disabled={itemCount === 0}
      title={isResubmission ? "Kirim ulang pertanggungjawaban?" : "Kirim pertanggungjawaban?"}
      description={
        <>
          {itemCount} nota, total {formatRupiah(itemTotal)} dari dana {formatRupiah(advanceAmount)}. {result}{" "}
          Setelah dikirim, nota tidak bisa diubah lagi kecuali dikembalikan untuk diperbaiki.
          {isLate && " Pengiriman ini melewati batas unggah nota, jadi alasan keterlambatan wajib diisi."}
        </>
      }
      confirmLabel="Kirim"
      successMessage="Pertanggungjawaban terkirim untuk diverifikasi."
      onConfirm={(formData) => submitSettlement(settlementId, String(formData.get("lateReason") ?? ""))}
    >
      {isLate ? (fieldError) => <LateReasonField error={fieldError("lateReason")} /> : undefined}
    </ActionDialog>
  );
}

function LateReasonField({ error }: { error?: string }) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="lateReason">Alasan keterlambatan</FieldLabel>
      <Textarea
        id="lateReason"
        name="lateReason"
        maxLength={500}
        placeholder="Contoh: Sedang sakit dan baru bisa mengunggah nota minggu ini"
        aria-invalid={!!error}
        required
      />
      <FieldDescription>Alasan ini tampil di laporan dan dilihat Owner.</FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
