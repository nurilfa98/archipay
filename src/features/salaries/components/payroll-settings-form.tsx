// Form Pengaturan → Penggajian (Owner, BUSINESS-FLOW §20.2): potong otomatis
// ketidakhadiran, cara menghitung tarif per hari, dan dasar potongan.

"use client";

import { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SubmitButton } from "@/features/subscriptions/components/platform-forms";
import { useFormAction } from "@/features/subscriptions/components/use-form-action";
import { updatePayrollSettings } from "../actions";
import {
  DAILY_RATE_METHOD_DESCRIPTIONS,
  DAILY_RATE_METHOD_LABELS,
  DAILY_RATE_METHODS,
  DEDUCTION_BASE_LABELS,
  DEDUCTION_BASES,
  type DailyRateMethod,
} from "../constants";
import type { PayrollSettings } from "../payslip-math";

export function PayrollSettingsForm({
  settings,
  attendanceActive,
}: {
  settings: PayrollSettings;
  attendanceActive: boolean; // add-on Absensi aktif (sumber data ketidakhadiran)
}) {
  const { pending, handleSubmit, fieldError } = useFormAction(
    updatePayrollSettings,
    "Pengaturan penggajian tersimpan.",
  );
  const [method, setMethod] = useState<DailyRateMethod>(settings.dailyRateMethod);

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FieldGroup>
        <Field orientation="horizontal" className="rounded-lg border p-3">
          <Checkbox
            id="absenceDeduction"
            name="absenceDeduction"
            value="1"
            defaultChecked={settings.absenceDeduction}
          />
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor="absenceDeduction">Potong otomatis ketidakhadiran</FieldLabel>
            <FieldDescription>
              Hari tidak hadir dan cuti/izin yang jenisnya &quot;tidak dibayar&quot; dipotong × tarif per hari. Sakit,
              cuti tahunan, dan izin berbayar tidak dipotong. Periode absensi wajib dikunci sebelum penggajian bulan itu
              diselesaikan.
              {!attendanceActive && " Butuh add-on Absensi aktif; tanpa itu potongan diisi manual."}
            </FieldDescription>
          </div>
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Cara menghitung tarif per hari</FieldLegend>
          <FieldDescription>
            Dipakai potongan ketidakhadiran dan prorata karyawan masuk/berhenti di tengah bulan.
          </FieldDescription>
          <RadioGroup
            name="dailyRateMethod"
            value={method}
            onValueChange={(value) => setMethod(value as DailyRateMethod)}
            className="flex flex-col gap-2"
          >
            {DAILY_RATE_METHODS.map((option) => (
              <Field key={option} orientation="horizontal" className="rounded-lg border p-3">
                <RadioGroupItem value={option} id={`method-${option}`} />
                <div className="flex flex-col gap-0.5">
                  <FieldLabel htmlFor={`method-${option}`}>{DAILY_RATE_METHOD_LABELS[option]}</FieldLabel>
                  <FieldDescription>{DAILY_RATE_METHOD_DESCRIPTIONS[option]}</FieldDescription>
                </div>
              </Field>
            ))}
          </RadioGroup>
          <FieldError>{fieldError("dailyRateMethod")}</FieldError>
        </FieldSet>

        <Field
          data-invalid={!!fieldError("dailyDivisor")}
          className={method === "FIXED_DIVISOR" ? undefined : "hidden"}
        >
          <FieldLabel htmlFor="dailyDivisor">Pembagi</FieldLabel>
          <Input
            id="dailyDivisor"
            name="dailyDivisor"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            defaultValue={settings.dailyDivisor}
            className="w-24 tabular-nums"
          />
          <FieldDescription>Umumnya 25, 26, atau 30.</FieldDescription>
          <FieldError>{fieldError("dailyDivisor")}</FieldError>
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Dasar potongan</FieldLegend>
          <RadioGroup name="deductionBase" defaultValue={settings.deductionBase} className="flex flex-col gap-2">
            {DEDUCTION_BASES.map((option) => (
              <Field key={option} orientation="horizontal">
                <RadioGroupItem value={option} id={`base-${option}`} />
                <FieldLabel htmlFor={`base-${option}`} className="font-normal">
                  {DEDUCTION_BASE_LABELS[option]}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
          <FieldError>{fieldError("deductionBase")}</FieldError>
        </FieldSet>

        <SubmitButton pending={pending} label="Simpan pengaturan penggajian" />
      </FieldGroup>
    </form>
  );
}
