// Input nomor rekening: hanya angka, strip otomatis mengikuti pola bank
// (lib/bank.ts): BCA 123-456-7890, BRI 1234-01-012345-50-3, dst. Nama bank
// dibaca dari input lain di form yang sama (prop `bankName`), sehingga pola
// berubah saat nama bank diganti. Server menyimpan angkanya saja.

"use client";

import { useState, type ComponentProps } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatAccountNumber } from "@/lib/bank";

type AccountNumberInputProps = Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange" | "type"> & {
  name: string;
  label: string;
  bankName: string;
  defaultValue?: string | null;
  description?: string;
  error?: string;
};

export function AccountNumberInput({
  name,
  label,
  bankName,
  defaultValue,
  description,
  error,
  ...inputProps
}: AccountNumberInputProps) {
  // Hanya digit yang disimpan; strip dihitung ulang tiap render dari nama bank.
  const [digits, setDigits] = useState(defaultValue?.replace(/\D/g, "") ?? "");
  const value = formatAccountNumber(bankName, digits);

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={!!error}
        value={value}
        onChange={(event) => setDigits(event.target.value.replace(/\D/g, ""))}
        className="tabular-nums"
        {...inputProps}
      />
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
