// Tombol + dialog "Catat pengembalian" (sisa dana dari karyawan) atau
// "Catat penggantian" (kantor membayar kekurangan) untuk OWNER/FINANCE.
//
// Nominal awal = seluruh sisa, tetapi boleh diubah untuk cicilan. Server
// menolak nominal yang melebihi sisa saldo di ledger. Tanggal diterima/dibayarkan
// (bawaan hari ini, boleh mundur 30 hari) dan foto bukti opsional ikut dicatat
// (BUSINESS-FLOW §8.1.1).

"use client";

import { useState } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { recordReimbursement, recordReturn } from "@/features/settlements/actions";
import type { SettleMethod } from "@/features/settlements/constants";
import { formatRupiah } from "@/lib/format";
import { DateField, MethodField, ProofField } from "./balance-fields";

export function SettlementBalanceAction({
  settlementId,
  kind,
  outstanding,
  summary,
  today,
  minDate,
}: {
  settlementId: string;
  kind: "return" | "reimburse";
  outstanding: number; // sisa saldo saat ini (positif)
  summary: string; // "PJ-2026-10-0001 · Budi"
  today: string; // "2026-11-06" (zona waktu perusahaan)
  minDate: string; // tanggal paling awal yang boleh dipilih
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
          <MethodField
            legend={isReturn ? "Dikembalikan secara" : "Dibayar secara"}
            value={method}
            onChange={setMethod}
            error={fieldError("method")}
          />
          <DateField
            name="receivedOn"
            label={isReturn ? "Tanggal diterima" : "Tanggal dibayar"}
            description={
              isReturn
                ? "Tanggal uang benar-benar Anda terima (mutasi rekening untuk transfer). Bawaan hari ini."
                : "Tanggal kekurangan benar-benar dibayarkan ke karyawan. Bawaan hari ini."
            }
            defaultValue={today}
            min={minDate}
            max={today}
            error={fieldError("receivedOn")}
          />
          <ProofField
            error={fieldError("proof")}
            required={!isReturn && method === "TRANSFER"}
            description={
              !isReturn
                ? method === "TRANSFER"
                  ? "Screenshot bukti transfer ke karyawan, maksimal 4 MB."
                  : "Tunai: karyawan akan diminta menekan Sudah saya terima. Foto kuitansi bila ada, maksimal 4 MB."
                : undefined
            }
          />
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
