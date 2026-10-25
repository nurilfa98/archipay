// Panel untuk karyawan penerima: konfirmasi terima dana + persetujuan potong
// gaji, atau laporkan bila dana tidak sesuai.
//
// Teks persetujuan dibuat di server (buildAcknowledgmentText) dan dikirim
// sebagai prop. Saat konfirmasi, server membuat ulang teks yang sama dari
// database lalu menyimpannya; browser hanya mengirim "setuju: true".

"use client";

import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { acknowledgeAdvance, disputeAdvance } from "@/features/advances/actions";
import { ActionDialog, ReasonField } from "./action-dialog";

export function AdvanceAcknowledgePanel({
  advanceId,
  acknowledgmentText,
  canDispute,
  disputeReason,
}: {
  advanceId: string;
  acknowledgmentText: string;
  canDispute: boolean;
  disputeReason: string | null;
}) {
  const [consent, setConsent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAcknowledge() {
    startTransition(async () => {
      const result = await acknowledgeAdvance(advanceId, consent);
      // Berhasil: halaman dimuat ulang oleh revalidatePath dan panel ini hilang.
      if (result.success) notify.success("Penerimaan dana dikonfirmasi.");
      else if (result.fieldErrors?.consent) setError(result.fieldErrors.consent[0]);
      else notify.error(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {disputeReason && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>Laporan Anda sudah dikirim ke Owner</AlertTitle>
          <AlertDescription>
            &ldquo;{disputeReason}&rdquo;. Bila ternyata dana sudah sesuai, Anda tetap bisa
            mengonfirmasi di bawah ini.
          </AlertDescription>
        </Alert>
      )}

      <blockquote className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
        {acknowledgmentText}
      </blockquote>

      <Field orientation="horizontal" data-invalid={!!error}>
        <Checkbox
          id="consent"
          checked={consent}
          onCheckedChange={(checked) => {
            setConsent(checked);
            setError(null);
          }}
        />
        <FieldLabel htmlFor="consent" className="font-normal">
          Saya sudah membaca dan menyetujui pernyataan di atas.
        </FieldLabel>
      </Field>
      <FieldError>{error}</FieldError>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!consent || pending} onClick={handleAcknowledge}>
          {pending && <LoaderCircleIcon className="animate-spin" />}
          Konfirmasi terima dana
        </Button>
        {canDispute && (
          <ActionDialog
            label="Laporkan tidak sesuai"
            variant="outline"
            disabled={pending}
            title="Laporkan dana tidak sesuai?"
            description="Owner akan menerima laporan Anda lewat WhatsApp untuk dicek."
            confirmLabel="Kirim laporan"
            successMessage="Laporan terkirim ke Owner."
            onConfirm={(formData) => disputeAdvance(advanceId, String(formData.get("reason") ?? ""))}
          >
            {(fieldError) => (
              <ReasonField
                label="Apa yang tidak sesuai?"
                placeholder="Contoh: Saya baru menerima Rp300.000, bukan Rp500.000"
                error={fieldError("reason")}
              />
            )}
          </ActionDialog>
        )}
      </div>
    </div>
  );
}
