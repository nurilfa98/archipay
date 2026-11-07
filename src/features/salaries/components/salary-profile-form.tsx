// Form data gaji satu karyawan (Owner, BUSINESS-FLOW §20.3): gaji pokok,
// tunjangan (tetap bulanan / per hari hadir), potongan tetap (BPJS, PPh 21
// diisi manual), masa kerja, nominal per hari, dan pengecualian potong otomatis.
// Daftar tunjangan/potongan dikirim sebagai JSON di isian tersembunyi.
// `readOnly` (Finance melihat data gaji dirinya sendiri, Owner, atau Finance
// lain): semua isian dinonaktifkan lewat <fieldset disabled>, tanpa tombol simpan.

"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
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
import { RupiahInput } from "@/features/subscriptions/components/rupiah-input";
import { SubmitButton } from "@/features/subscriptions/components/platform-forms";
import { formatRupiah } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";
import { saveSalaryProfile } from "../actions";
import { MAX_COMPONENTS, type ComponentType, type DailyRateMethod, type OvertimeMethod } from "../constants";
import type { SalaryProfileInput } from "../payslip-math";

type Row = { key: number; type: ComponentType; name: string; amount: string; perDay: boolean };

let nextKey = 0;
const toRow = (component: SalaryProfileInput["components"][number]): Row => ({
  key: nextKey++,
  type: component.type,
  name: component.name,
  amount: String(component.amount),
  perDay: component.perDay,
});

export function SalaryProfileForm({
  userId,
  profile,
  dailyRateMethod,
  overtimeMethod,
  readOnly = false,
}: {
  userId: string;
  profile: SalaryProfileInput | null;
  dailyRateMethod: DailyRateMethod;
  overtimeMethod: OvertimeMethod;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => (profile?.components ?? []).map(toRow));
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const add = (type: ComponentType) =>
    setRows((current) => [...current, { key: nextKey++, type, name: "", amount: "", perDay: false }]);
  const remove = (key: number) => setRows((current) => current.filter((row) => row.key !== key));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set(
      "components",
      JSON.stringify(
        rows.map((row) => ({
          type: row.type,
          name: row.name,
          amount: Number(row.amount.replace(/\D/g, "") || 0),
          perDay: row.perDay,
        })),
      ),
    );
    startTransition(async () => {
      const result = await saveSalaryProfile(userId, formData);
      if (result.success) {
        notify.success("Data gaji tersimpan.");
        setError(null);
        router.push("/payroll/salaries");
      } else {
        setError(result);
        notify.error(result.fieldErrors?.components?.[0] ?? result.message);
      }
    });
  }

  const allowances = rows.filter((row) => row.type === "ALLOWANCE");
  const deductions = rows.filter((row) => row.type === "DEDUCTION");

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <fieldset disabled={readOnly} className="min-w-0">
        <FieldGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            <RupiahInput
              name="baseSalary"
              label="Gaji pokok per bulan"
              defaultValue={profile?.baseSalary ?? null}
              error={fieldError("baseSalary")}
            />
            {dailyRateMethod === "FIXED_AMOUNT" && (
              <RupiahInput
                name="dailyRate"
                label="Nominal per hari"
                defaultValue={profile?.dailyRate ?? null}
                description="Tarif potongan tidak hadir & prorata (Pengaturan → Penggajian)."
                optional
                error={fieldError("dailyRate")}
              />
            )}
            {overtimeMethod === "CUSTOM" && (
              <RupiahInput
                name="overtimeHourlyRate"
                label="Tarif lembur per jam"
                defaultValue={profile?.overtimeHourlyRate ?? null}
                description="Upah lembur = jam lembur × tarif ini (Pengaturan → Penggajian). Kosong = lembur tidak dibayar."
                optional
                error={fieldError("overtimeHourlyRate")}
              />
            )}
          </div>

          <ComponentList
            type="ALLOWANCE"
            title="Tunjangan"
            description="Tetap bulanan, atau per hari hadir (mis. uang makan/transport = nominal × hari hadir)."
            rows={allowances}
            onAdd={() => add("ALLOWANCE")}
            onChange={update}
            onRemove={remove}
            disabled={rows.length >= MAX_COMPONENTS}
          />
          <ComponentList
            type="DEDUCTION"
            title="Potongan tetap"
            description="Mis. BPJS Kesehatan, BPJS Ketenagakerjaan, PPh 21, cicilan koperasi. Diisi manual, dipotong setiap bulan."
            rows={deductions}
            onAdd={() => add("DEDUCTION")}
            onChange={update}
            onRemove={remove}
            disabled={rows.length >= MAX_COMPONENTS}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={!!fieldError("startDate")}>
              <FieldLabel htmlFor="startDate">Tanggal mulai kerja (opsional)</FieldLabel>
              <Input id="startDate" name="startDate" type="date" defaultValue={profile?.startDate ?? ""} />
              <FieldDescription>Hari kerja sebelum tanggal ini dipotong prorata.</FieldDescription>
              <FieldError>{fieldError("startDate")}</FieldError>
            </Field>
            <Field data-invalid={!!fieldError("endDate")}>
              <FieldLabel htmlFor="endDate">Tanggal berhenti (opsional)</FieldLabel>
              <Input id="endDate" name="endDate" type="date" defaultValue={profile?.endDate ?? ""} />
              <FieldDescription>Hari kerja setelah tanggal ini dipotong prorata.</FieldDescription>
              <FieldError>{fieldError("endDate")}</FieldError>
            </Field>
          </div>

          <Field orientation="horizontal" className="rounded-lg border p-3">
            <Checkbox
              id="absenceExempt"
              name="absenceExempt"
              value="1"
              defaultChecked={profile?.absenceExempt ?? false}
              disabled={readOnly}
            />
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor="absenceExempt">Tidak dipotong otomatis</FieldLabel>
              <FieldDescription>
                Ketidakhadiran karyawan ini tidak dipotong (mis. manajer, staf lapangan).
              </FieldDescription>
            </div>
          </Field>

          {!readOnly && <SubmitButton pending={pending} label="Simpan data gaji" />}
        </FieldGroup>
      </fieldset>
    </form>
  );
}

function ComponentList({
  type,
  title,
  description,
  rows,
  onAdd,
  onChange,
  onRemove,
  disabled,
}: {
  type: ComponentType;
  title: string;
  description: string;
  rows: Row[];
  onAdd: () => void;
  onChange: (key: number, patch: Partial<Row>) => void;
  onRemove: (key: number) => void;
  disabled: boolean;
}) {
  const isAllowance = type === "ALLOWANCE";
  return (
    <FieldSet>
      <FieldLegend variant="label">{title}</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      {rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <Field className="min-w-40 flex-1">
                  <FieldLabel htmlFor={`name-${row.key}`} className="text-xs">
                    Nama
                  </FieldLabel>
                  <Input
                    id={`name-${row.key}`}
                    value={row.name}
                    maxLength={60}
                    placeholder={isAllowance ? "Mis. Uang makan" : "Mis. BPJS Kesehatan"}
                    onChange={(event) => onChange(row.key, { name: event.target.value })}
                    required
                  />
                </Field>
                <Field className="w-40">
                  <FieldLabel htmlFor={`amount-${row.key}`} className="text-xs">
                    {row.perDay ? "Nominal per hari" : "Nominal per bulan"}
                  </FieldLabel>
                  <Input
                    id={`amount-${row.key}`}
                    inputMode="numeric"
                    className="tabular-nums"
                    value={row.amount ? Number(row.amount).toLocaleString("id-ID") : ""}
                    onChange={(event) =>
                      onChange(row.key, { amount: event.target.value.replace(/\D/g, "").slice(0, 11) })
                    }
                    required
                  />
                </Field>
                <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(row.key)} aria-label="Hapus">
                  <Trash2Icon />
                </Button>
              </div>
              {isAllowance && (
                <Field orientation="horizontal">
                  <Checkbox
                    id={`perday-${row.key}`}
                    checked={row.perDay}
                    onCheckedChange={(value) => onChange(row.key, { perDay: value === true })}
                  />
                  <FieldLabel htmlFor={`perday-${row.key}`} className="font-normal">
                    Per hari hadir
                    {row.perDay && row.amount && ` (${formatRupiah(Number(row.amount))} × hari hadir)`}
                  </FieldLabel>
                </Field>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={disabled}>
          <PlusIcon />
          Tambah {title.toLowerCase()}
        </Button>
      </div>
    </FieldSet>
  );
}
