// Tombol Terima / Tolak untuk satu pembayaran langganan (Superadmin).
//
// - Terima: isi nominal yang BENAR-BENAR masuk ke rekening (awal = sisa
//   tagihan). Total ≥ harga → lunas & masa aktif diperpanjang; kurang →
//   tagihan menjadi Kurang bayar dan Owner diminta melengkapi.
// - Tolak: alasan wajib (dana tidak masuk / bukti tidak jelas), tampil ke Owner.

"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog, ReasonField } from "@/features/advances/components/action-dialog";
import { AmountField } from "@/features/settlements/components/settlement-balance-action";
import { acceptPayment, rejectPayment } from "../actions";

export function PaymentReviewActions({
  paymentId,
  summary,
  remaining,
}: {
  paymentId: string;
  summary: string;
  remaining: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog
        label="Terima"
        icon={<CheckIcon />}
        showLabel
        size="sm"
        title="Terima pembayaran ini?"
        description={`${summary}. Isi nominal yang benar-benar masuk ke rekening sesuai mutasi. Bila kurang dari tagihan, Owner diminta melengkapi kekurangannya.`}
        confirmLabel="Terima pembayaran"
        successMessage="Pembayaran diterima. Owner sudah diberi kabar."
        onConfirm={(formData) => acceptPayment(paymentId, formData)}
      >
        {(fieldError) => (
          <>
            <AmountField defaultValue={remaining} error={fieldError("amount")} />
            <Field data-invalid={!!fieldError("note")}>
              <FieldLabel htmlFor="note">Keterangan (opsional)</FieldLabel>
              <Input id="note" name="note" maxLength={255} autoComplete="off" placeholder="Misal: ref. transfer BCA 1234" />
              <FieldError>{fieldError("note")}</FieldError>
            </Field>
          </>
        )}
      </ActionDialog>
      <ActionDialog
        label="Tolak"
        icon={<XIcon />}
        showLabel
        size="sm"
        variant="outline"
        title="Tolak pembayaran ini?"
        description={`${summary}. Alasan penolakan dikirim ke Owner.`}
        confirmLabel="Tolak pembayaran"
        successMessage="Pembayaran ditolak. Owner sudah diberi kabar."
        onConfirm={(formData) => rejectPayment(paymentId, formData)}
      >
        {(fieldError) => (
          <ReasonField
            label="Alasan penolakan"
            placeholder="Misal: dana belum masuk ke rekening, bukti tidak terbaca"
            error={fieldError("reason")}
          />
        )}
      </ActionDialog>
    </div>
  );
}
