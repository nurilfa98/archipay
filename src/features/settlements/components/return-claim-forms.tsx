// Tombol & dialog laporan pengembalian (BUSINESS-FLOW §8.1.1):
// - ReturnClaimButton   : karyawan, "Saya sudah mengembalikan".
// - ClaimDecisionButtons: Owner/Finance, "Konfirmasi diterima" / "Tolak".
// Aturan sebenarnya (hak akses, tanggal, nominal) diperiksa ulang di server.

"use client";

import { CheckIcon, SendIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog, ReasonField } from "@/features/advances/components/action-dialog";
import { confirmReturnClaim, rejectReturnClaim, reportReturn } from "@/features/settlements/return-claim-actions";
import type { SettleMethod } from "@/features/settlements/constants";
import { formatRupiah } from "@/lib/format";
import { DateField, MethodField, ProofField } from "./balance-fields";
import { AmountField } from "./settlement-balance-action";

type DateRange = { today: string; minDate: string };

export function ReturnClaimButton({
  settlementId,
  outstanding,
  summary,
  today,
  minDate,
}: { settlementId: string; outstanding: number; summary: string } & DateRange) {
  const [method, setMethod] = useState<SettleMethod>("CASH");
  return (
    <ActionDialog
      label="Saya sudah mengembalikan"
      icon={<SendIcon />}
      showLabel
      title="Lapor sudah mengembalikan sisa dana?"
      description={`${summary}. Sisa yang harus dikembalikan ${formatRupiah(outstanding)}. Isi setelah Anda benar-benar menyerahkan atau mentransfer. Owner/Finance akan mengecek lalu mengonfirmasi; selama menunggu, Anda tidak ditagih dan tidak dipotong gaji.`}
      confirmLabel="Kirim laporan"
      successMessage="Laporan terkirim. Menunggu konfirmasi Owner/Finance."
      onConfirm={(formData) => reportReturn(settlementId, formData)}
    >
      {(fieldError) => (
        <>
          <AmountField defaultValue={outstanding} error={fieldError("amount")} />
          <MethodField legend="Dikembalikan secara" value={method} onChange={setMethod} error={fieldError("method")} />
          <DateField
            name="returnedOn"
            label="Tanggal pengembalian"
            description="Tanggal Anda menyerahkan uangnya atau mentransfernya."
            defaultValue={today}
            min={minDate}
            max={today}
            error={fieldError("returnedOn")}
          />
          <ProofField
            error={fieldError("proof")}
            description={
              method === "TRANSFER"
                ? "Screenshot bukti transfer, maksimal 4 MB."
                : "Foto kuitansi atau tanda terima bila ada, maksimal 4 MB."
            }
          />
          <Field data-invalid={!!fieldError("note")}>
            <FieldLabel htmlFor="claim-note">Catatan (opsional)</FieldLabel>
            <Input id="claim-note" name="note" maxLength={300} autoComplete="off" />
            <FieldError>{fieldError("note")}</FieldError>
          </Field>
        </>
      )}
    </ActionDialog>
  );
}

export function ClaimDecisionButtons({
  claimId,
  amount,
  returnedOn,
  returnedOnLabel,
  methodLabel,
  summary,
  today,
  minDate,
}: {
  claimId: string;
  amount: number;
  returnedOn: string; // "2026-11-03", bawaan tanggal diterima
  returnedOnLabel: string; // "3 Nov 2026"
  methodLabel: string; // "Tunai" / "Transfer"
  summary: string;
} & DateRange) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog
        label="Konfirmasi diterima"
        icon={<CheckIcon />}
        showLabel
        title="Konfirmasi uang sudah diterima?"
        description={`${summary}. Karyawan melapor ${methodLabel.toLowerCase()} ${formatRupiah(amount)} pada ${returnedOnLabel}. Cocokkan dengan ${methodLabel === "Transfer" ? "mutasi rekening" : "kas yang Anda terima"}, dan konfirmasi hanya bila uangnya benar-benar sudah masuk. Nominal dan tanggal boleh dikoreksi.`}
        confirmLabel="Konfirmasi"
        successMessage="Pengembalian dikonfirmasi dan tercatat."
        onConfirm={(formData) => confirmReturnClaim(claimId, formData)}
      >
        {(fieldError) => (
          <>
            <AmountField defaultValue={amount} error={fieldError("amount")} />
            <DateField
              name="receivedOn"
              label="Tanggal diterima"
              description={
                methodLabel === "Transfer"
                  ? "Tanggal uang masuk di mutasi rekening."
                  : "Tanggal uang tunai benar-benar Anda terima."
              }
              defaultValue={returnedOn}
              min={minDate}
              max={today}
              error={fieldError("receivedOn")}
            />
            <Field data-invalid={!!fieldError("note")}>
              <FieldLabel htmlFor="confirm-note">Catatan (opsional)</FieldLabel>
              <Input id="confirm-note" name="note" maxLength={300} autoComplete="off" />
              <FieldError>{fieldError("note")}</FieldError>
            </Field>
          </>
        )}
      </ActionDialog>
      <ActionDialog
        label="Tolak"
        icon={<XIcon />}
        showLabel
        variant="destructive"
        title="Tolak laporan pengembalian?"
        description={`${summary}. Karyawan dikabari lewat WhatsApp beserta alasannya, dan sisa dana kembali tercatat belum dikembalikan.`}
        confirmLabel="Tolak laporan"
        successMessage="Laporan ditolak."
        onConfirm={(formData) => rejectReturnClaim(claimId, formData)}
      >
        {(fieldError) => (
          <ReasonField
            label="Alasan"
            placeholder="Misal: belum ada di mutasi rekening, nominal tidak sesuai"
            error={fieldError("reason")}
          />
        )}
      </ActionDialog>
    </div>
  );
}
