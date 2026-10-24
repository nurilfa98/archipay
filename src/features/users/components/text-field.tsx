// Satu baris form (label + input + pesan error) yang dipakai berulang di form
// tambah & edit pengguna, supaya setiap field tidak perlu ditulis 10 baris.

import type { ComponentProps } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type TextFieldProps = ComponentProps<typeof Input> & {
  name: string;
  label: string;
  description?: string;
  error?: string;
};

export function TextField({ name, label, description, error, ...inputProps }: TextFieldProps) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} name={name} aria-invalid={!!error} {...inputProps} />
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
