// Tombol + dialog "Catat pengembalian" (sisa dana dari karyawan) atau
// "Catat penggantian" (kantor membayar kekurangan) untuk OWNER/FINANCE.
//
// Nominal awal = seluruh sisa, tetapi boleh diubah untuk cicilan. Server
// menolak nominal yang melebihi sisa saldo di ledger.

"use client";

import { useState } from "react";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { recordReimbursement, recordReturn } from "@/features/settlements/actions";
import { LEDGER_METHOD_LABELS, SETTLE_METHODS, type SettleMethod } from "@/features/settlements/constants";
import { formatRupiah } from "@/lib/format";

export function SettlementBalanceAction({
  settlementId,
  kind,
  outstanding,
  summary,
}: {
  settlementId: string;
  kind: "return" | "reimburse";
  outstanding: number; // sisa saldo saat ini (positif)
  summary: string; // "PJ-2026-10-0001 · Budi"
}) {
  const [method, setMethod] = useState<SettleMethod>("CASH");
  const isReturn = kind === "return";

  return (
    <ActionDialog
      label={isReturn ? "Catat pengembalian" : "Catat penggantian"}
      title={isReturn ? "Catat sisa dana yang dikembalikan?" : "Catat pembayaran penggantian?"}
      description={
        isReturn
          ? `${summary}. Sisa yang belum dikembalikan ${formatRupiah(outstanding)}. Catat setelah uang benar-benar Anda terima.`
          : `${summary}. Kekurangan yang belum dibayar ${formatRupiah(outstanding)}. Catat setelah uang benar-benar diserahkan ke karyawan.`
      }
      confirmLabel="Simpan"
      successMessage={isReturn ? "Pengembalian dana tercatat." : "Pembayaran penggantian tercatat."}
      onConfirm={(formData) => (isReturn ? recordReturn(settlementId, formData) : recordReimbursement(settlementId, formData))}
    >
      {(fieldError) => (
        <>
          <AmountField defaultValue={outstanding} error={fieldError("amount")} />
          <FieldSet>
            <FieldLegend variant="label">{isReturn ? "Dikembalikan secara" : "Dibayar secara"}</FieldLegend>
            <RadioGroup
              name="method"
              value={method}
              onValueChange={(value) => setMethod(value as SettleMethod)}
              className="flex gap-6"
            >
              {SETTLE_METHODS.map((option) => (
                <Field key={option} orientation="horizontal" className="w-auto">
                  <RadioGroupItem value={option} id={`settle-method-${option}`} />
                  <FieldLabel htmlFor={`settle-method-${option}`} className="font-normal">
                    {LEDGER_METHOD_LABELS[option]}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
            <FieldError>{fieldError("method")}</FieldError>
          </FieldSet>
          {method === "TRANSFER" && (
            <Field data-invalid={!!fieldError("reference")}>
              <FieldLabel htmlFor="reference">Nomor referensi transfer (opsional)</FieldLabel>
              <Input id="reference" name="reference" maxLength={100} autoComplete="off" />
              <FieldError>{fieldError("reference")}</FieldError>
            </Field>
          )}
          <Field data-invalid={!!fieldError("note")}>
            <FieldLabel htmlFor="note">Catatan (opsional)</FieldLabel>
            <Input id="note" name="note" maxLength={300} autoComplete="off" />
            <FieldError>{fieldError("note")}</FieldError>
          </Field>
        </>
      )}
    </ActionDialog>
  );
}

// Nominal dengan pemisah ribuan ("80.000"); server membuang selain angka.
export function AmountField({ defaultValue, error }: { defaultValue: number; error?: string }) {
  const [digits, setDigits] = useState(String(defaultValue));
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="amount">Nominal</FieldLabel>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
          Rp
        </span>
        <Input
          id="amount"
          name="amount"
          inputMode="numeric"
          autoComplete="off"
          className="pl-9 tabular-nums"
          value={digits ? Number(digits).toLocaleString("id-ID") : ""}
          onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 13))}
          aria-invalid={!!error}
          required
        />
      </div>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
