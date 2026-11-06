// Tombol karyawan atas penggantian kekurangan yang dibayar Owner/Finance
// (BUSINESS-FLOW §8.1.2): "Sudah saya terima" atau "Belum saya terima".
// "Belum saya terima" membatalkan pencatatan pembayaran dan langsung mengabari
// Owner. Aturan sebenarnya diperiksa ulang di server.

"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { formatRupiah } from "@/lib/format";
import { acknowledgeReimbursement, disputeReimbursement } from "../reimbursement-ack-actions";

export function ReimbursementAckButtons({
  entryId,
  amount,
  summary,
}: {
  entryId: string;
  amount: number;
  summary: string; // "PJ-2026-10-0001"
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog
        label="Sudah saya terima"
        icon={<CheckIcon />}
        showLabel
        title="Konfirmasi uang sudah Anda terima?"
        description={`${summary}. Penggantian ${formatRupiah(amount)}. Konfirmasi hanya bila uangnya benar-benar sudah Anda terima.`}
        confirmLabel="Ya, sudah saya terima"
        successMessage="Terima kasih, penerimaan penggantian dikonfirmasi."
        onConfirm={() => acknowledgeReimbursement(entryId)}
      />
      <ActionDialog
        label="Belum saya terima"
        icon={<XIcon />}
        showLabel
        variant="destructive"
        title="Belum menerima uangnya?"
        description={`${summary}. Pencatatan pembayaran ${formatRupiah(amount)} dibatalkan dan Owner langsung diberi tahu lewat WhatsApp. Kekurangan kembali tercatat belum dibayar.`}
        confirmLabel="Ya, belum saya terima"
        successMessage="Dicatat: belum diterima. Owner sudah diberi tahu."
        onConfirm={(formData) => disputeReimbursement(entryId, formData)}
      >
        {(fieldError) => (
          <Field data-invalid={!!fieldError("note")}>
            <FieldLabel htmlFor="dispute-note">Catatan (opsional)</FieldLabel>
            <Input id="dispute-note" name="note" maxLength={250} autoComplete="off" placeholder="Misal: transfer belum masuk" />
            <FieldError>{fieldError("note")}</FieldError>
          </Field>
        )}
      </ActionDialog>
    </div>
  );
}
