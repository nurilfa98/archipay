// Isian nominal rupiah dengan pemisah ribuan ("1.500.000") untuk form
// langganan. Nilai yang dikirim tetap teks berformat; server membuang
// selain angka (features/subscriptions/schemas.ts). Kosong diperbolehkan
// bila `optional` (harga khusus: kosong = pakai harga standar).

"use client";

import { useState } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function RupiahInput({
  name,
  label,
  defaultValue,
  description,
  placeholder,
  optional = false,
  onValueChange,
  error,
}: {
  name: string;
  label: string;
  defaultValue: number | null;
  description?: string;
  placeholder?: string;
  optional?: boolean;
  // Dipanggil setiap nilai berubah (kosong = 0), untuk kalkulasi otomatis.
  onValueChange?: (value: number) => void;
  error?: string;
}) {
  const [digits, setDigits] = useState(defaultValue == null ? "" : String(defaultValue));
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
          Rp
        </span>
        <Input
          id={name}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          className="pl-9 tabular-nums"
          value={digits ? Number(digits).toLocaleString("id-ID") : ""}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, "").slice(0, 11);
            setDigits(next);
            onValueChange?.(Number(next || 0));
          }}
          aria-invalid={!!error}
          required={!optional}
        />
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
