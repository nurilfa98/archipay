// Form jam kerja, toleransi & denda keterlambatan, dan hari kerja (Owner) di
// halaman Pengaturan. Polanya sama dengan CompanySettingsForm.
// readOnly (superadmin): isian dinonaktifkan, tombol simpan tidak tampil.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useActionResult } from "@/hooks/use-action-result";
import { notify } from "@/lib/notify";
import type { AttendanceSettings } from "../queries";
import { minutesToTimeInput, WEEKDAYS } from "../schedule";
import { updateAttendanceSettings } from "../settings-actions";
import { TimeField } from "./location-form";

export function AttendanceSettingsForm({
  settings,
  readOnly = false,
}: {
  settings: AttendanceSettings;
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateAttendanceSettings, undefined);
  const [penaltyDigits, setPenaltyDigits] = useState(String(settings.latePenaltyAmount));
  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  useActionResult(state, (result) => {
    if (result.success) notify.success("Pengaturan absensi tersimpan.");
    else if (!result.fieldErrors) notify.error(result.message);
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const formData = new FormData(event.currentTarget);
    formData.set("latePenaltyAmount", penaltyDigits);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <fieldset disabled={readOnly} className="min-w-0">
        <FieldGroup>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <TimeField
              name="workStart"
              label="Jam masuk"
              defaultValue={minutesToTimeInput(settings.workStartMinute)}
              error={fieldError("workStartMinute")}
            />
            <TimeField
              name="workEnd"
              label="Jam pulang"
              defaultValue={minutesToTimeInput(settings.workEndMinute)}
              error={fieldError("workEndMinute")}
            />
          </div>
          <FieldDescription className="-mt-3">
            Waktu setempat di lokasi absen. Lokasi boleh punya jam sendiri (menu Absensi → Lokasi).
          </FieldDescription>

          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Field data-invalid={!!fieldError("lateToleranceMinutes")}>
              <FieldLabel htmlFor="lateToleranceMinutes">Toleransi terlambat</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="lateToleranceMinutes"
                  name="lateToleranceMinutes"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={180}
                  defaultValue={settings.lateToleranceMinutes}
                  className="w-24 tabular-nums"
                  aria-invalid={!!fieldError("lateToleranceMinutes")}
                  required
                />
                <span className="text-sm text-muted-foreground">menit</span>
              </div>
              <FieldDescription>Absen masuk lewat jam masuk + toleransi dihitung terlambat.</FieldDescription>
              <FieldError>{fieldError("lateToleranceMinutes")}</FieldError>
            </Field>

            <Field data-invalid={!!fieldError("latePenaltyAmount")}>
              <FieldLabel htmlFor="latePenaltyAmount">Denda per keterlambatan</FieldLabel>
              <div className="relative max-w-60">
                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id="latePenaltyAmount"
                  inputMode="numeric"
                  autoComplete="off"
                  className="pl-9 tabular-nums"
                  value={penaltyDigits ? Number(penaltyDigits).toLocaleString("id-ID") : ""}
                  onChange={(event) => setPenaltyDigits(event.target.value.replace(/\D/g, "").slice(0, 9))}
                  aria-invalid={!!fieldError("latePenaltyAmount")}
                  required
                />
              </div>
              <FieldDescription>
                Masuk daftar Potong Gaji setelah review bulanan. Isi 0 bila belum memakai denda. Pastikan denda sudah
                diatur di perjanjian kerja / peraturan perusahaan.
              </FieldDescription>
              <FieldError>{fieldError("latePenaltyAmount")}</FieldError>
            </Field>
          </div>

          <FieldSet data-invalid={!!fieldError("workDays")}>
            <FieldLegend variant="label">Hari kerja</FieldLegend>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              {WEEKDAYS.map((day) => (
                <Field key={day.bit} orientation="horizontal" className="w-auto">
                  <Checkbox
                    id={`workDay-${day.bit}`}
                    name="workDays"
                    value={String(day.bit)}
                    defaultChecked={(settings.workDays & day.bit) !== 0}
                  />
                  <FieldLabel htmlFor={`workDay-${day.bit}`} className="font-normal">
                    {day.label}
                  </FieldLabel>
                </Field>
              ))}
            </div>
            <FieldDescription>Hari di luar ini (dan hari libur di bawah) tidak dihitung tidak hadir.</FieldDescription>
            <FieldError>{fieldError("workDays")}</FieldError>
          </FieldSet>

          {readOnly ? (
            <p className="text-sm text-muted-foreground">Baca saja. Pengaturan absensi diubah oleh Owner.</p>
          ) : (
            <Field orientation="horizontal" className="border-t pt-4">
              <Button type="submit" disabled={pending}>
                {pending && <LoaderCircleIcon className="animate-spin" />}
                {pending ? "Menyimpan..." : "Simpan pengaturan absensi"}
              </Button>
            </Field>
          )}
        </FieldGroup>
      </fieldset>
    </form>
  );
}
