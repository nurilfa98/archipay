// Tombol & form penggajian bulanan (Owner, BUSINESS-FLOW §20.4): buat
// penggajian, hitung ulang, tanggal bayar, selesaikan, buka kunci, ubah/hapus
// baris, tambah baris manual, dan hapus data gaji. Server Action selalu
// memeriksa ulang status draf & hak akses.

"use client";

import {
  CalculatorIcon,
  CheckCheckIcon,
  LockOpenIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { useActionResult } from "@/hooks/use-action-result";
import { formatRupiah } from "@/lib/format";
import { notify } from "@/lib/notify";
import { deleteSalaryProfile } from "../actions";
import {
  addManualLine,
  createPayrollRun,
  finalizePayrollRun,
  recalculatePayrollRun,
  removePayslipLine,
  reopenPayrollRun,
  setPayDate,
  updatePayslipLineAmount,
} from "../run-actions";

export function CreateRunForm({ defaultPeriod, maxPeriod }: { defaultPeriod: string; maxPeriod: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createPayrollRun, undefined);
  const error = state && !state.success ? state : undefined;

  useActionResult(state, (result) => {
    if (result.success) {
      notify.success("Draf penggajian dibuat. Periksa lalu selesaikan.");
      router.push(`/payroll/${result.data.period}`);
    } else if (!result.fieldErrors) notify.error(result.message);
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <Field data-invalid={!!error?.fieldErrors?.period} className="w-auto">
        <FieldLabel htmlFor="period">Bulan</FieldLabel>
        <Input id="period" name="period" type="month" defaultValue={defaultPeriod} max={maxPeriod} required />
        <FieldError>{error?.fieldErrors?.period?.[0]}</FieldError>
      </Field>
      <Button type="submit" variant="brand" disabled={pending}>
        <CalculatorIcon />
        Buat penggajian
      </Button>
    </form>
  );
}

export function RecalculateButton({ period }: { period: string }) {
  return (
    <ActionDialog
      label="Hitung ulang"
      icon={<RefreshCwIcon />}
      showLabel
      variant="outline"
      title="Hitung ulang penggajian?"
      description="Semua baris otomatis disusun ulang dari data gaji, absensi, sisa uang muka, dan denda terbaru. Perubahan nominal pada baris otomatis akan hilang; baris manual tetap."
      confirmLabel="Hitung ulang"
      successMessage="Penggajian dihitung ulang."
      onConfirm={() => recalculatePayrollRun(period)}
    />
  );
}

export function PayDateForm({ period, payDate }: { period: string; payDate: string | null }) {
  const [value, setValue] = useState(payDate ?? "");
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await setPayDate(period, new FormData(event.currentTarget));
        setPending(false);
        if (result.success) notify.success("Tanggal bayar tersimpan.");
        else notify.error(result.fieldErrors?.payDate?.[0] ?? result.message);
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <Field className="w-auto">
        <FieldLabel htmlFor="payDate">Tanggal bayar</FieldLabel>
        <Input
          id="payDate"
          name="payDate"
          type="date"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
        />
      </Field>
      <Button type="submit" variant="outline" disabled={pending || !value || value === payDate}>
        Simpan
      </Button>
    </form>
  );
}

export function FinalizeButton({
  period,
  periodLabel,
  totalNet,
  people,
  pendingAdvances,
  pendingPenalties,
  disabled,
}: {
  period: string;
  periodLabel: string;
  totalNet: number;
  people: number;
  pendingAdvances: number;
  pendingPenalties: number;
  disabled?: boolean;
}) {
  const notes = [
    pendingAdvances > 0 ? `${pendingAdvances} potongan sisa uang muka dicatat ke Potong Gaji` : null,
    pendingPenalties > 0 ? `${pendingPenalties} kelompok denda ditandai dipotong` : null,
  ].filter(Boolean);
  return (
    <ActionDialog
      label="Selesaikan penggajian"
      icon={<CheckCheckIcon />}
      showLabel
      disabled={disabled}
      title={`Selesaikan penggajian ${periodLabel}?`}
      description={`${people} slip, total gaji bersih ${formatRupiah(totalNet)}. Angka terkunci dan slip tampil di menu Slip Gaji karyawan.${notes.length ? ` ${notes.join("; ")}. Pencatatan ini tidak bisa dibatalkan.` : ""}`}
      confirmLabel="Selesaikan"
      successMessage="Penggajian selesai. Slip gaji sudah bisa diunduh."
      onConfirm={() => finalizePayrollRun(period)}
    />
  );
}

export function ReopenButton({ period }: { period: string }) {
  return (
    <ActionDialog
      label="Buka kunci"
      icon={<LockOpenIcon />}
      showLabel
      variant="outline"
      title="Buka kunci penggajian?"
      description="Penggajian kembali menjadi draf dan slip disembunyikan dari karyawan sampai diselesaikan lagi. Potongan sisa uang muka & denda yang sudah tercatat tetap tercatat."
      confirmLabel="Buka kunci"
      successMessage="Penggajian kembali menjadi draf."
      onConfirm={() => reopenPayrollRun(period)}
    />
  );
}

export function EditLineButton({ lineId, label, amount }: { lineId: string; label: string; amount: number }) {
  const [digits, setDigits] = useState(String(amount));
  return (
    <ActionDialog
      label="Ubah nominal"
      icon={<PencilIcon />}
      size="icon-sm"
      variant="ghost"
      title="Ubah nominal"
      description={label}
      confirmLabel="Simpan"
      successMessage="Nominal diubah."
      onConfirm={(formData) => updatePayslipLineAmount(lineId, formData)}
    >
      {(fieldError) => (
        <Field data-invalid={!!fieldError("amount")}>
          <FieldLabel htmlFor={`amount-${lineId}`}>Nominal</FieldLabel>
          <Input
            id={`amount-${lineId}`}
            name="amount"
            inputMode="numeric"
            className="tabular-nums"
            value={digits ? Number(digits).toLocaleString("id-ID") : ""}
            onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 11))}
            required
          />
          <FieldDescription>Sisa uang muka boleh dikurangi (dicicil); sisanya tetap di Potong Gaji.</FieldDescription>
          <FieldError>{fieldError("amount")}</FieldError>
        </Field>
      )}
    </ActionDialog>
  );
}

export function RemoveLineButton({ lineId, label }: { lineId: string; label: string }) {
  return (
    <ActionDialog
      label="Hapus baris"
      icon={<Trash2Icon />}
      size="icon-sm"
      variant="ghost"
      title="Hapus baris ini?"
      description={`${label}. Baris otomatis akan muncul lagi saat Hitung ulang; sisa uang muka & denda tetap di Potong Gaji untuk bulan lain.`}
      confirmLabel="Hapus"
      successMessage="Baris dihapus."
      onConfirm={() => removePayslipLine(lineId)}
    />
  );
}

export function AddManualLineButton({ payslipId, fullName }: { payslipId: string; fullName: string }) {
  const [digits, setDigits] = useState("");
  return (
    <ActionDialog
      label="Tambah baris"
      icon={<PlusIcon />}
      showLabel
      size="sm"
      variant="outline"
      title={`Tambah baris untuk ${fullName}`}
      description="Mis. lembur, bonus, THR, atau potongan lain bulan ini."
      confirmLabel="Tambah"
      successMessage="Baris ditambahkan."
      onConfirm={async (formData) => {
        const result = await addManualLine(payslipId, formData);
        if (result.success) setDigits("");
        return result;
      }}
    >
      {(fieldError) => (
        <>
          <Field data-invalid={!!fieldError("type")}>
            <FieldLabel>Jenis</FieldLabel>
            <RadioGroup name="type" defaultValue="EARNING" className="flex gap-4">
              <Field orientation="horizontal" className="w-auto">
                <RadioGroupItem value="EARNING" id={`type-earning-${payslipId}`} />
                <FieldLabel htmlFor={`type-earning-${payslipId}`} className="font-normal">
                  Pendapatan
                </FieldLabel>
              </Field>
              <Field orientation="horizontal" className="w-auto">
                <RadioGroupItem value="DEDUCTION" id={`type-deduction-${payslipId}`} />
                <FieldLabel htmlFor={`type-deduction-${payslipId}`} className="font-normal">
                  Potongan
                </FieldLabel>
              </Field>
            </RadioGroup>
            <FieldError>{fieldError("type")}</FieldError>
          </Field>
          <Field data-invalid={!!fieldError("label")}>
            <FieldLabel htmlFor={`label-${payslipId}`}>Keterangan</FieldLabel>
            <Input id={`label-${payslipId}`} name="label" maxLength={150} placeholder="Mis. Lembur 6 jam" required />
            <FieldError>{fieldError("label")}</FieldError>
          </Field>
          <Field data-invalid={!!fieldError("amount")}>
            <FieldLabel htmlFor={`manual-amount-${payslipId}`}>Nominal</FieldLabel>
            <Input
              id={`manual-amount-${payslipId}`}
              name="amount"
              inputMode="numeric"
              className="tabular-nums"
              value={digits ? Number(digits).toLocaleString("id-ID") : ""}
              onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 11))}
              required
            />
            <FieldError>{fieldError("amount")}</FieldError>
          </Field>
        </>
      )}
    </ActionDialog>
  );
}

export function DeleteSalaryProfileButton({ userId, fullName }: { userId: string; fullName: string }) {
  const router = useRouter();
  return (
    <ActionDialog
      label="Hapus data gaji"
      icon={<Trash2Icon />}
      showLabel
      variant="destructive"
      title={`Hapus data gaji ${fullName}?`}
      description="Karyawan ini tidak ikut penggajian berikutnya. Slip yang sudah dibuat tetap tersimpan."
      confirmLabel="Hapus"
      successMessage="Data gaji dihapus."
      onConfirm={async () => {
        const result = await deleteSalaryProfile(userId);
        if (result.success) router.push("/payroll/salaries");
        return result;
      }}
    />
  );
}
