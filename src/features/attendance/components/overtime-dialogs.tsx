// Dialog "Ajukan lembur" (karyawan) dan "Tugaskan lembur" (Owner/Admin HR),
// BUSINESS-FLOW §24.2. Isian dikirim sebagai FormData ke Server Action; jam
// rencana adalah jam setempat lokasi absen, tidak boleh melewati tengah malam.

"use client";

import { HandHelpingIcon, PlusIcon } from "lucide-react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog, ReasonField } from "@/features/advances/components/action-dialog";
import { assignOvertime, requestOvertime } from "../overtime-actions";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type FieldErrorOf = (name: string) => string | undefined;

function DateTimeFields({
  fieldError,
  today,
  dateHint,
}: {
  fieldError: FieldErrorOf;
  today: string;
  dateHint: string;
}) {
  return (
    <>
      <Field data-invalid={!!fieldError("date")}>
        <FieldLabel htmlFor="overtime-date">Tanggal</FieldLabel>
        <Input id="overtime-date" name="date" type="date" min={dateHint} defaultValue={today} required />
        <FieldDescription>Harus hari libur (libur nasional/perusahaan atau di luar hari kerja).</FieldDescription>
        <FieldError>{fieldError("date")}</FieldError>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field data-invalid={!!fieldError("start")}>
          <FieldLabel htmlFor="overtime-start">Jam mulai</FieldLabel>
          <Input id="overtime-start" name="start" type="time" defaultValue="09:00" required />
          <FieldError>{fieldError("start")}</FieldError>
        </Field>
        <Field data-invalid={!!fieldError("end")}>
          <FieldLabel htmlFor="overtime-end">Jam selesai</FieldLabel>
          <Input id="overtime-end" name="end" type="time" defaultValue="13:00" required />
          <FieldError>{fieldError("end")}</FieldError>
        </Field>
      </div>
    </>
  );
}

export function RequestOvertimeButton({ today }: { today: string }) {
  return (
    <ActionDialog
      label="Ajukan lembur"
      icon={<PlusIcon />}
      showLabel
      title="Ajukan lembur"
      description="Absen di hari libur hanya bisa setelah lembur disetujui. Jam lembur dihitung dari absen Anda, paling banyak sesuai jam yang diajukan."
      confirmLabel="Kirim pengajuan"
      successMessage="Pengajuan lembur terkirim."
      onConfirm={requestOvertime}
    >
      {(fieldError) => (
        <>
          <DateTimeFields fieldError={fieldError} today={today} dateHint={today} />
          <ReasonField
            label="Keperluan"
            placeholder="Misal: menyelesaikan pekerjaan proyek"
            error={fieldError("reason")}
          />
        </>
      )}
    </ActionDialog>
  );
}

export function AssignOvertimeButton({ today, people }: { today: string; people: { id: string; fullName: string }[] }) {
  return (
    <ActionDialog
      label="Tugaskan lembur"
      icon={<HandHelpingIcon />}
      showLabel
      variant="outline"
      title="Tugaskan lembur"
      description="Langsung berlaku. Karyawan bisa absen di tanggal itu, dan boleh menolak dengan alasan."
      confirmLabel="Tugaskan"
      successMessage="Lembur ditugaskan."
      onConfirm={assignOvertime}
    >
      {(fieldError) => (
        <>
          <Field data-invalid={!!fieldError("userId")}>
            <FieldLabel htmlFor="overtime-user">Karyawan</FieldLabel>
            <select id="overtime-user" name="userId" defaultValue="" required className={selectClass}>
              <option value="" disabled>
                Pilih karyawan
              </option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </select>
            <FieldError>{fieldError("userId")}</FieldError>
          </Field>
          <DateTimeFields fieldError={fieldError} today={today} dateHint="" />
          <ReasonField
            label="Keterangan"
            placeholder="Misal: serah terima proyek hari Minggu"
            error={fieldError("reason")}
          />
        </>
      )}
    </ActionDialog>
  );
}
