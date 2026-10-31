// Input nomor WhatsApp/telepon: hanya angka, strip otomatis tiap 4 digit
// ("0857-1432-5506") agar mudah dibaca. Nilai yang terkirim di FormData
// berisi strip; server membuang semua karakter selain angka
// (normalizeIndonesianPhone di lib/phone.ts).
//
// Dipakai di form pengguna, profil, company, dan Pengaturan platform.

"use client";

import { useState, type ComponentProps } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatPhoneInput } from "@/lib/phone";

type PhoneInputProps = Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange" | "type"> & {
  name: string;
  label: string;
  // Nomor awal dalam format apa pun (62…, 08…, dengan/tanpa strip).
  defaultValue?: string | null;
  description?: string;
  error?: string;
};

export function PhoneInput({ name, label, defaultValue, description, error, ...inputProps }: PhoneInputProps) {
  const [value, setValue] = useState(defaultValue ? formatPhoneInput(toLocal(defaultValue)) : "");

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="0812-3456-7890"
        aria-invalid={!!error}
        value={value}
        onChange={(event) => setValue(formatPhoneInput(event.target.value))}
        className="tabular-nums"
        {...inputProps}
      />
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

// "6285714325506" → "085714325506" agar tampil dalam format lokal.
function toLocal(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
}
