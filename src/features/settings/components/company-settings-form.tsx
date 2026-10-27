// Form kebijakan uang muka (OWNER). Memakai onSubmit + startTransition agar
// isian tidak hilang saat validasi gagal (lihat user-create-form.tsx).
// Hasil simpan (berhasil / error umum) tampil sebagai toast.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateCompanySettings } from "@/features/settings/actions";
import type { CompanySettings } from "@/features/settings/queries";

export function CompanySettingsForm({ settings }: { settings: CompanySettings }) {
  const [state, formAction, pending] = useActionState(updateCompanySettings, undefined);
  const [maxDigits, setMaxDigits] = useState(String(settings.noReceiptMaxAmount));
  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  useEffect(() => {
    if (state?.success) notify.success("Pengaturan tersimpan.");
    else if (state && !state.fieldErrors) notify.error(state.message);
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("noReceiptMaxAmount", maxDigits);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <DaysField
            name="settlementDueDays"
            label="Batas unggah nota"
            defaultValue={settings.settlementDueDays}
            description="Hari kalender sejak dana dicairkan."
            error={fieldError("settlementDueDays")}
          />
          <DaysField
            name="returnDueDays"
            label="Batas pengembalian sisa dana"
            defaultValue={settings.returnDueDays}
            description="Hari kalender sejak nota diverifikasi."
            error={fieldError("returnDueDays")}
          />
        </div>

        <DaysField
          name="maxOverdueAdvances"
          label="Batas uang muka tertunda"
          max={10}
          unit="uang muka"
          defaultValue={settings.maxOverdueAdvances}
          description="Karyawan yang sudah mencapai jumlah ini (lewat batas unggah nota, belum dipertanggungjawabkan) tidak bisa menerima uang muka baru."
          error={fieldError("maxOverdueAdvances")}
        />

        <Field data-invalid={!!fieldError("noReceiptMaxAmount")}>
          <FieldLabel htmlFor="noReceiptMaxAmount">Batas biaya tanpa nota (per item)</FieldLabel>
          <div className="relative max-w-60">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
              Rp
            </span>
            <Input
              id="noReceiptMaxAmount"
              inputMode="numeric"
              autoComplete="off"
              className="pl-9 tabular-nums"
              value={maxDigits ? Number(maxDigits).toLocaleString("id-ID") : ""}
              onChange={(event) => setMaxDigits(event.target.value.replace(/\D/g, "").slice(0, 9))}
              aria-invalid={!!fieldError("noReceiptMaxAmount")}
              required
            />
          </div>
          <FieldDescription>Untuk parkir, ojek, dll. Isi 0 bila semua biaya wajib bernota.</FieldDescription>
          <FieldError>{fieldError("noReceiptMaxAmount")}</FieldError>
        </Field>

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : "Simpan pengaturan"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

function DaysField({
  name,
  label,
  defaultValue,
  description,
  error,
  max = 60,
  unit = "hari",
}: {
  name: string;
  label: string;
  defaultValue: number;
  description: string;
  error?: string;
  max?: number;
  unit?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          defaultValue={defaultValue}
          className="w-24 tabular-nums"
          aria-invalid={!!error}
          required
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <FieldDescription>{description}</FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
