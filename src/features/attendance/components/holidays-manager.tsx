// Daftar hari libur satu tahun (Owner): tambah tanggal + nama, hapus.
// Hari libur tidak dihitung hari kerja di rekap absensi & pengajuan cuti.
// Tanggal diformat di server lalu dikirim sebagai teks (dateText).

"use client";

import { LoaderCircleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";
import { createHoliday, deleteHoliday } from "../settings-actions";

export type HolidayRow = {
  id: string;
  date: string;
  dateText: string;
  name: string;
};

export function HolidaysManager({ holidays, readOnly = false }: { holidays: HolidayRow[]; readOnly?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createHoliday(formData);
      if (!result.success) {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      setError(null);
      formRef.current?.reset();
      notify.success("Hari libur ditambahkan.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field data-invalid={!!fieldError("date")} className="sm:w-44">
            <FieldLabel htmlFor="holiday-date">Tanggal</FieldLabel>
            <Input id="holiday-date" name="date" type="date" aria-invalid={!!fieldError("date")} required />
            <FieldError>{fieldError("date")}</FieldError>
          </Field>
          <Field data-invalid={!!fieldError("name")} className="flex-1">
            <FieldLabel htmlFor="holiday-name">Nama hari libur</FieldLabel>
            <Input
              id="holiday-name"
              name="name"
              maxLength={100}
              placeholder="Misal: Hari Raya Idulfitri"
              aria-invalid={!!fieldError("name")}
              required
            />
            <FieldError>{fieldError("name")}</FieldError>
          </Field>
          <Button type="submit" disabled={pending} className="sm:mt-6">
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <PlusIcon />}
            Tambah
          </Button>
        </form>
      )}

      {holidays.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Belum ada hari libur yang dicatat.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {holidays.map((holiday) => (
            <HolidayItem key={holiday.id} holiday={holiday} readOnly={readOnly} />
          ))}
        </ul>
      )}
    </div>
  );
}

function HolidayItem({ holiday, readOnly }: { holiday: HolidayRow; readOnly: boolean }) {
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteHoliday(holiday.id);
      if (result.success) notify.success(`"${holiday.name}" dihapus dari hari libur.`);
      else notify.error(result.message);
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="font-medium">{holiday.name}</p>
        <p className="text-sm text-muted-foreground">{holiday.dateText}</p>
      </div>
      {!readOnly && (
        <Button
          variant="destructive"
          size="icon-sm"
          aria-label={`Hapus ${holiday.name}`}
          title="Hapus hari libur"
          onClick={remove}
          disabled={pending}
        >
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}
        </Button>
      )}
    </li>
  );
}
