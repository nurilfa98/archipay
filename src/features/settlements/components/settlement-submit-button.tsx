// Tombol "Kirim pertanggungjawaban" (karyawan) dengan dialog konfirmasi.
// Setelah dikirim, nota terkunci sampai diverifikasi atau dikembalikan.

"use client";

import { ActionDialog } from "@/features/advances/components/action-dialog";
import { submitSettlement } from "@/features/settlements/actions";
import { formatRupiah } from "@/lib/format";

export function SettlementSubmitButton({
  settlementId,
  itemCount,
  itemTotal,
  advanceAmount,
  isResubmission,
}: {
  settlementId: string;
  itemCount: number;
  itemTotal: number;
  advanceAmount: number;
  isResubmission: boolean;
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
        </>
      }
      confirmLabel="Kirim"
      successMessage="Pertanggungjawaban terkirim untuk diverifikasi."
      onConfirm={() => submitSettlement(settlementId)}
    />
  );
}
