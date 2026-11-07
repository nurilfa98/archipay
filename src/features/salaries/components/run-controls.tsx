// Tombol & form penggajian bulanan (BUSINESS-FLOW §20.1, §20.4): buat
// penggajian, hitung ulang, tanggal bayar, ubah/hapus baris, tambah baris
// manual (langsung di kolom, tanpa dialog), hapus data gaji (Owner & Finance), kirim ke Owner (Finance),
// selesaikan & buka kunci (Owner). Server Action selalu memeriksa ulang status
// draf & hak akses.

"use client";

import {
  CalculatorIcon,
  CheckCheckIcon,
  LoaderCircleIcon,
  LockOpenIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { useActionResult } from "@/hooks/use-action-result";
import { formatRupiah } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";
import { deleteSalaryProfile } from "../actions";
import {
  addManualLine,
  createPayrollRun,
  finalizePayrollRun,
  recalculatePayrollRun,
  removePayslipLine,
  reopenPayrollRun,
  requestPayrollReview,
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

// Finance: draf siap diperiksa → WhatsApp langsung ke Owner.
export function RequestReviewButton({ period, disabled }: { period: string; disabled?: boolean }) {
  return (
    <ActionDialog
      label="Kirim ke Owner"
      icon={<SendIcon />}
      showLabel
      variant="brand"
      disabled={disabled}
      title="Kirim ke Owner untuk diperiksa?"
      description="Owner menerima WhatsApp bahwa penggajian ini siap diperiksa dan diselesaikan. Bila draf diubah lagi, kirim ulang setelahnya."
      confirmLabel="Kirim"
      successMessage="Terkirim ke Owner."
      onConfirm={() => requestPayrollReview(period)}
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
      className="text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/40 dark:hover:text-orange-300"
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
      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
      title="Hapus baris ini?"
      description={`${label}. Baris otomatis akan muncul lagi saat Hitung ulang; sisa uang muka & denda tetap di Potong Gaji untuk bulan lain.`}
      confirmLabel="Hapus"
      successMessage="Baris dihapus."
      onConfirm={() => removePayslipLine(lineId)}
    />
  );
}

// Tambah baris manual langsung di kolom Pendapatan / Potongan (tanpa dialog): tombol "Tambah
// pendapatan" / "Tambah potongan" membuka satu baris isian di bawah daftar. Jenisnya ikut kolom,
// jadi tidak perlu memilih lagi.
export function AddLineInline({ payslipId, type }: { payslipId: string; type: "EARNING" | "DEDUCTION" }) {
  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const [pending, startAdding] = useTransition();
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];
  const noun = type === "EARNING" ? "pendapatan" : "potongan";

  function close() {
    setOpen(false);
    setDigits("");
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startAdding(async () => {
      const result = await addManualLine(payslipId, formData);
      if (!result.success) {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      notify.success("Baris ditambahkan.");
      close();
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed border-violet-300 text-violet-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40 dark:hover:text-violet-200"
        onClick={() => setOpen(true)}
      >
        <PlusIcon />
        Tambah {noun}
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border border-dashed bg-muted/30 p-3">
      <input type="hidden" name="type" value={type} />
      <Field data-invalid={!!fieldError("label")}>
        <FieldLabel htmlFor={`label-${type}-${payslipId}`} className="sr-only">
          Keterangan
        </FieldLabel>
        <Input
          id={`label-${type}-${payslipId}`}
          name="label"
          maxLength={150}
          placeholder={type === "EARNING" ? "Keterangan, mis. Bonus proyek" : "Keterangan, mis. Cicilan koperasi"}
          autoFocus
          required
        />
        <FieldError>{fieldError("label")}</FieldError>
      </Field>
      <Field data-invalid={!!fieldError("amount")}>
        <FieldLabel htmlFor={`amount-${type}-${payslipId}`} className="sr-only">
          Nominal
        </FieldLabel>
        <Input
          id={`amount-${type}-${payslipId}`}
          name="amount"
          inputMode="numeric"
          placeholder="Nominal (Rp)"
          className="tabular-nums"
          value={digits ? Number(digits).toLocaleString("id-ID") : ""}
          onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 11))}
          required
        />
        <FieldError>{fieldError("amount")}</FieldError>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="brand" disabled={pending}>
          {pending && <LoaderCircleIcon className="animate-spin" />}
          Simpan
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={close}>
          Batal
        </Button>
      </div>
    </form>
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
