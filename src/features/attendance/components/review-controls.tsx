// Kontrol review bulanan absensi (BUSINESS-FLOW §18.9–18.10):
// - LockControls        : kunci / buka kunci periode (Owner)
// - PenaltyWaiveSwitch  : centang denda = berlaku; cabut centang = dibebaskan (Owner)
// - CorrectionForm      : koreksi / tambah absen satu tanggal (Owner)
// - PenaltyDeductAction : tandai denda sudah dipotong di Potong Gaji (Owner & Finance)

"use client";

import { LoaderCircleIcon, LockIcon, LockOpenIcon } from "lucide-react";
import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { formatRupiah } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";
import {
  correctAttendance,
  lockPeriod,
  markPenaltiesDeducted,
  setPenaltyWaived,
  unlockPeriod,
} from "../review-actions";

export function LockControls({
  period,
  periodLabel,
  locked,
}: {
  period: string;
  periodLabel: string;
  locked: boolean;
}) {
  return locked ? (
    <ActionDialog
      label="Buka kunci"
      icon={<LockOpenIcon />}
      showLabel
      variant="outline"
      title={`Buka kunci ${periodLabel}?`}
      description="Absensi, denda, dan cuti/izin bulan ini bisa diubah lagi. Tidak bisa dibuka bila ada denda yang sudah ditandai dipotong."
      confirmLabel="Buka kunci"
      successMessage={`Kunci ${periodLabel} dibuka.`}
      onConfirm={() => unlockPeriod(period)}
    />
  ) : (
    <ActionDialog
      label="Kunci periode"
      icon={<LockIcon />}
      showLabel
      title={`Kunci ${periodLabel}?`}
      description="Setelah dikunci, absensi, denda, dan cuti/izin bulan ini tidak bisa diubah, dan denda yang masih tercentang masuk menu Potong Gaji."
      confirmLabel="Kunci periode"
      successMessage={`${periodLabel} dikunci. Denda masuk menu Potong Gaji.`}
      onConfirm={() => lockPeriod(period)}
    />
  );
}

export function PenaltyWaiveSwitch({
  penaltyId,
  active,
  label,
  disabled,
}: {
  penaltyId: string;
  active: boolean;
  label: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(active);
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={optimistic}
        disabled={disabled || pending}
        aria-label={label}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            setOptimistic(checked);
            const result = await setPenaltyWaived(penaltyId, !checked);
            if (!result.success) notify.error(result.message);
            else notify.success(checked ? "Denda diberlakukan lagi." : "Denda dibebaskan.");
          })
        }
      />
      {optimistic ? "Denda berlaku" : "Dibebaskan"}
      {pending && <LoaderCircleIcon className="size-3.5 animate-spin" />}
    </label>
  );
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function CorrectionForm({
  userId,
  locations,
  minDate,
  maxDate,
}: {
  userId: string;
  locations: { id: string; name: string }[];
  minDate: string;
  maxDate: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await correctAttendance(userId, formData);
      if (!result.success) {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      setError(null);
      form.reset();
      notify.success("Absen dikoreksi. Keterlambatan & denda dihitung ulang.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!fieldError("date")}>
            <FieldLabel htmlFor="correct-date">Tanggal</FieldLabel>
            <Input id="correct-date" name="date" type="date" min={minDate} max={maxDate} required />
            <FieldError>{fieldError("date")}</FieldError>
          </Field>
          <Field data-invalid={!!fieldError("locationId")}>
            <FieldLabel htmlFor="correct-location">Lokasi</FieldLabel>
            <select id="correct-location" name="locationId" className={selectClass} required>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            <FieldError>{fieldError("locationId")}</FieldError>
          </Field>
          <Field data-invalid={!!fieldError("checkIn")}>
            <FieldLabel htmlFor="correct-in">Jam masuk</FieldLabel>
            <Input id="correct-in" name="checkIn" type="time" required />
            <FieldError>{fieldError("checkIn")}</FieldError>
          </Field>
          <Field data-invalid={!!fieldError("checkOut")}>
            <FieldLabel htmlFor="correct-out">Jam pulang (opsional)</FieldLabel>
            <Input id="correct-out" name="checkOut" type="time" />
            <FieldError>{fieldError("checkOut")}</FieldError>
          </Field>
        </div>
        <Field data-invalid={!!fieldError("note")}>
          <FieldLabel htmlFor="correct-note">Alasan koreksi</FieldLabel>
          <Textarea id="correct-note" name="note" rows={2} maxLength={500} required />
          <FieldDescription>
            Misal: HP mati, sudah dicek atasan. Bila tanggal itu sudah ada absen, jam masuk/pulangnya diganti (hasil
            cocok wajah absen asli tetap tersimpan). Tercatat di Audit Log.
          </FieldDescription>
          <FieldError>{fieldError("note")}</FieldError>
        </Field>
        <Button type="submit" className="self-start" disabled={pending}>
          {pending && <LoaderCircleIcon className="animate-spin" />}
          Simpan koreksi
        </Button>
      </FieldGroup>
    </form>
  );
}

export function PenaltyDeductAction({
  userId,
  period,
  summary,
  total,
  defaultPayrollPeriod,
}: {
  userId: string;
  period: string;
  summary: string;
  total: number;
  defaultPayrollPeriod: string;
}) {
  return (
    <ActionDialog
      label="Tandai dipotong"
      variant="outline"
      title="Tandai denda sudah dipotong dari gaji?"
      description={`${summary}. Total ${formatRupiah(total)}. Catat setelah potongan benar-benar diterapkan di penggajian.`}
      confirmLabel="Simpan"
      successMessage="Potongan denda tercatat."
      onConfirm={(formData) => markPenaltiesDeducted(userId, period, formData)}
    >
      {(fieldError) => (
        <Field data-invalid={!!fieldError("period")}>
          <FieldLabel htmlFor={`deduct-${userId}-${period}`}>Periode gaji</FieldLabel>
          <Input
            id={`deduct-${userId}-${period}`}
            name="period"
            type="month"
            defaultValue={defaultPayrollPeriod}
            required
          />
          <FieldDescription>
            Total potongan per periode maksimal 50% upah (PP 36/2021), digabung dengan potongan sisa uang muka.
          </FieldDescription>
          <FieldError>{fieldError("period")}</FieldError>
        </Field>
      )}
    </ActionDialog>
  );
}
