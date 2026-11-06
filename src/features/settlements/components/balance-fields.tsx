// Isian bersama untuk dialog pengembalian/penggantian saldo (BUSINESS-FLOW
// §8.1): cara bayar, tanggal, dan foto bukti opsional. Dipakai laporan karyawan,
// konfirmasi laporan, dan pencatatan langsung Owner/Finance.

"use client";

import type { ChangeEvent } from "react";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { compressImage } from "@/features/settlements/compress-image";
import { LEDGER_METHOD_LABELS, SETTLE_METHODS, type SettleMethod } from "@/features/settlements/constants";

export function MethodField({
  legend,
  value,
  onChange,
  error,
}: {
  legend: string;
  value: SettleMethod;
  onChange: (value: SettleMethod) => void;
  error?: string;
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <RadioGroup
        name="method"
        value={value}
        onValueChange={(next) => onChange(next as SettleMethod)}
        className="flex gap-6"
      >
        {SETTLE_METHODS.map((option) => (
          <Field key={option} orientation="horizontal" className="w-auto">
            <RadioGroupItem value={option} id={`balance-method-${option}`} />
            <FieldLabel htmlFor={`balance-method-${option}`} className="font-normal">
              {LEDGER_METHOD_LABELS[option]}
            </FieldLabel>
          </Field>
        ))}
      </RadioGroup>
      <FieldError>{error}</FieldError>
    </FieldSet>
  );
}

// Tanggal "2026-11-03". `min`/`max` dihitung server (zona waktu perusahaan);
// server memeriksa ulang aturannya (balance-evidence.ts → checkBalanceDate).
export function DateField({
  name,
  label,
  description,
  defaultValue,
  min,
  max,
  error,
}: {
  name: string;
  label: string;
  description?: string;
  defaultValue: string;
  min: string;
  max: string;
  error?: string;
}) {
  const id = `balance-date-${name}`;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type="date"
        defaultValue={defaultValue}
        min={min}
        max={max}
        aria-invalid={!!error}
        required
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

// Foto/PDF bukti, OPSIONAL. Foto dikompres di browser (sama dengan nota) lalu
// dipasang kembali ke isian file, sehingga form tetap terkirim apa adanya.
export function ProofField({
  error,
  description,
  required = false,
}: {
  error?: string;
  description?: string;
  required?: boolean; // transfer penggantian: bukti wajib
}) {
  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    if (compressed === file) return;
    const transfer = new DataTransfer();
    transfer.items.add(compressed);
    input.files = transfer.files;
  }

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="balance-proof">Foto bukti {required ? "(wajib)" : "(opsional)"}</FieldLabel>
      <Input
        id="balance-proof"
        name="proof"
        type="file"
        accept="image/*,application/pdf"
        onChange={handleChange}
        required={required}
      />
      <FieldDescription>
        {description ?? "Screenshot bukti transfer atau foto kuitansi, maksimal 4 MB."}
      </FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
