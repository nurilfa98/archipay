// Pengaturan Lembur di halaman Pengaturan (BUSINESS-FLOW §24): wajib izin lembur untuk absen
// di hari libur (canEdit: Owner & Admin HR) dan delegasi persetujuan lembur ke Admin HR,
// terpisah dari delegasi cuti/izin (canDelegate: hanya Owner). Yang lain melihat saja.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useActionResult } from "@/hooks/use-action-result";
import { notify } from "@/lib/notify";
import { updateOvertimeSettings } from "../overtime-actions";
import type { OvertimeSettings } from "../overtime-queries";

export function OvertimeSettingsForm({
  settings,
  canEdit,
  canDelegate,
}: {
  settings: OvertimeSettings;
  canEdit: boolean;
  canDelegate: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateOvertimeSettings, undefined);
  const [required, setRequired] = useState(settings.attendanceOvertimeRequired);
  const [delegation, setDelegation] = useState(settings.overtimeDelegationEnabled);
  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];
  useActionResult(state, (result) => {
    if (result.success) notify.success("Pengaturan lembur tersimpan.");
    else if (!result.fieldErrors) notify.error(result.message);
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <fieldset disabled={!canEdit} className="min-w-0">
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="attendanceOvertimeRequired"
              name="attendanceOvertimeRequired"
              checked={required}
              onCheckedChange={(checked) => setRequired(checked)}
            />
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor="attendanceOvertimeRequired">Wajib izin lembur untuk absen di hari libur</FieldLabel>
              <FieldDescription>
                Dicentang: karyawan hanya bisa absen di hari libur bila lembur sudah disetujui atau ditugaskan, sehingga
                rekap kehadiran sesuai kenyataan. Tidak dicentang: absen di hari libur tetap boleh tanpa izin, tetapi
                hanya yang punya izin lembur yang dihitung lembur.
              </FieldDescription>
            </div>
          </Field>

          <fieldset disabled={!canDelegate} className="flex min-w-0 flex-col gap-4 rounded-lg border p-3 sm:p-4">
            {!canDelegate && <p className="text-xs text-muted-foreground">Delegasi hanya bisa diatur oleh Owner.</p>}
            <Field orientation="horizontal">
              <Checkbox
                id="overtimeDelegationEnabled"
                name="overtimeDelegationEnabled"
                checked={delegation}
                onCheckedChange={(checked) => setDelegation(checked)}
              />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="overtimeDelegationEnabled">
                  Delegasikan ke Admin HR bila saya belum memproses
                </FieldLabel>
                <FieldDescription>
                  Berlaku bila perusahaan punya pengguna dengan role Admin HR. Tanpa Admin HR, pengajuan tetap menunggu Owner.
                </FieldDescription>
              </div>
            </Field>
            <Field data-invalid={!!fieldError("overtimeDelegationHours")}>
              <FieldLabel htmlFor="overtimeDelegationHours">Waktu tunggu delegasi</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="overtimeDelegationHours"
                  name="overtimeDelegationHours"
                  type="number"
                  min={1}
                  max={168}
                  defaultValue={settings.overtimeDelegationHours}
                  className="w-24 tabular-nums"
                  disabled={!delegation}
                  required
                />
                <span className="text-sm text-muted-foreground">jam</span>
              </div>
              <FieldDescription>
                Setelah waktu ini, Admin HR boleh menyetujui/menolak pengajuan lembur dan diberi tahu lewat lonceng. Owner
                tetap bisa memproses kapan saja.
              </FieldDescription>
              {/* Isian yang dinonaktifkan tidak terkirim: kirim nilai lama. */}
              {!delegation && (
                <input type="hidden" name="overtimeDelegationHours" value={settings.overtimeDelegationHours} />
              )}
              <FieldError>{fieldError("overtimeDelegationHours")}</FieldError>
            </Field>
          </fieldset>

          {canEdit && (
            <Field orientation="horizontal" className="border-t pt-4">
              <Button type="submit" disabled={pending}>
                {pending && <LoaderCircleIcon className="animate-spin" />}
                {pending ? "Menyimpan..." : "Simpan pengaturan lembur"}
              </Button>
            </Field>
          )}
        </FieldGroup>
      </fieldset>
    </form>
  );
}
