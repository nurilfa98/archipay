// Isian dialog "Tolak foto wajah" (Owner / Admin HR): dropdown alasan (shadcn
// Select) + catatan. Catatan opsional, kecuali alasan "Lainnya". Alasan dan
// catatan ditampilkan ke karyawan di kartu "Foto yang diajukan"; aturannya
// diperiksa ulang di server (rejectFaceSchema).

"use client";

import { useState } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FACE_REJECT_REASONS, faceRejectReason } from "../constants";

const ITEMS = FACE_REJECT_REASONS.map((item) => ({ value: item.code, label: item.label }));

export function FaceRejectFields({ codeError, noteError }: { codeError?: string; noteError?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const hint = faceRejectReason(code)?.hint;

  return (
    <>
      <Field data-invalid={!!codeError}>
        <FieldLabel htmlFor="face-reject-code">Alasan</FieldLabel>
        <Select name="code" items={ITEMS} value={code} onValueChange={(next) => setCode(next as string | null)}>
          <SelectTrigger id="face-reject-code" className="w-full" aria-invalid={!!codeError}>
            <SelectValue placeholder="Pilih alasan penolakan" />
          </SelectTrigger>
          <SelectContent>
            {ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hint && <FieldDescription>Saran untuk karyawan: {hint}</FieldDescription>}
        <FieldError>{codeError}</FieldError>
      </Field>
      <Field data-invalid={!!noteError}>
        <FieldLabel htmlFor="face-reject-note">Catatan {code === "OTHER" ? "(wajib)" : "(opsional)"}</FieldLabel>
        <Input
          id="face-reject-note"
          name="note"
          maxLength={200}
          autoComplete="off"
          placeholder="Misal: yang terlihat di foto bukan Nita"
          aria-invalid={!!noteError}
        />
        <FieldError>{noteError}</FieldError>
      </Field>
    </>
  );
}
