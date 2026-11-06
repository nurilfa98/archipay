// Pengaturan cuti & izin (Owner), BUSINESS-FLOW §19:
// - LeaveSettingsForm   : kuota cuti tahunan bawaan & delegasi ke Admin HR
// - LeaveTypesManager   : jenis cuti/izin (tambah, ubah, aktif/nonaktif)
// - LeaveQuotaTable     : kuota cuti khusus per karyawan
// readOnly (superadmin): hanya melihat.

"use client";

import { LoaderCircleIcon, PencilIcon, PlusIcon } from "lucide-react";
import { startTransition, useActionState, useState, useTransition, type FormEvent } from "react";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PersonAvatar } from "./person-avatar";
import { useActionResult } from "@/hooks/use-action-result";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";
import { LEAVE_ATTACHMENT_LABELS, LEAVE_ATTACHMENTS, LEAVE_KIND_LABELS, LEAVE_KINDS } from "../constants";
import { saveLeaveType, setLeaveTypeActive, setUserLeaveQuota, updateLeaveSettings } from "../leave-actions";
import type { LeaveSettings, LeaveType } from "../leave-queries";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function LeaveSettingsForm({ settings, readOnly }: { settings: LeaveSettings; readOnly: boolean }) {
  const [state, formAction, pending] = useActionState(updateLeaveSettings, undefined);
  const [delegation, setDelegation] = useState(settings.leaveDelegationEnabled);
  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];
  useActionResult(state, (result) => {
    if (result.success) notify.success("Pengaturan cuti & izin tersimpan.");
    else if (!result.fieldErrors) notify.error(result.message);
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <fieldset disabled={readOnly} className="min-w-0">
        <FieldGroup>
          <Field data-invalid={!!fieldError("annualLeaveQuota")}>
            <FieldLabel htmlFor="annualLeaveQuota">Kuota cuti tahunan</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="annualLeaveQuota"
                name="annualLeaveQuota"
                type="number"
                min={0}
                max={60}
                defaultValue={settings.annualLeaveQuota}
                className="w-24 tabular-nums"
                required
              />
              <span className="text-sm text-muted-foreground">hari kerja per tahun</span>
            </div>
            <FieldDescription>
              Bawaan untuk semua karyawan (UU Ketenagakerjaan: 12 hari). Bisa diubah per karyawan di menu Absensi → Cuti
              & izin.
            </FieldDescription>
            <FieldError>{fieldError("annualLeaveQuota")}</FieldError>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id="leaveDelegationEnabled"
              name="leaveDelegationEnabled"
              checked={delegation}
              onCheckedChange={(checked) => setDelegation(checked)}
            />
            <FieldLabel htmlFor="leaveDelegationEnabled" className="font-normal">
              Delegasikan ke Admin HR bila saya belum memproses
            </FieldLabel>
          </Field>
          <Field data-invalid={!!fieldError("leaveDelegationHours")}>
            <FieldLabel htmlFor="leaveDelegationHours">Waktu tunggu delegasi</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="leaveDelegationHours"
                name="leaveDelegationHours"
                type="number"
                min={1}
                max={168}
                defaultValue={settings.leaveDelegationHours}
                className="w-24 tabular-nums"
                disabled={!delegation}
                required
              />
              <span className="text-sm text-muted-foreground">jam</span>
            </div>
            <FieldDescription>
              Setelah waktu ini, Admin HR boleh menyetujui/menolak cuti & izin dan diberi tahu lewat WhatsApp. Anda
              tetap bisa memproses kapan saja. Uang muka & denda tidak didelegasikan.
            </FieldDescription>
            {/* Isian yang dinonaktifkan tidak terkirim: kirim nilai lama. */}
            {!delegation && <input type="hidden" name="leaveDelegationHours" value={settings.leaveDelegationHours} />}
            <FieldError>{fieldError("leaveDelegationHours")}</FieldError>
          </Field>

          {!readOnly && (
            <Field orientation="horizontal">
              <Button type="submit" disabled={pending}>
                {pending && <LoaderCircleIcon className="animate-spin" />}
                {pending ? "Menyimpan..." : "Simpan pengaturan cuti"}
              </Button>
            </Field>
          )}
        </FieldGroup>
      </fieldset>
    </form>
  );
}

export function LeaveTypesManager({ types, readOnly }: { types: LeaveType[]; readOnly: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-lg border">
        {types.map((type) =>
          editing === type.id ? (
            <li key={type.id} className="p-3">
              <LeaveTypeForm type={type} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={type.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-medium">{type.name}</p>
                <p className="text-sm text-muted-foreground">
                  {LEAVE_KIND_LABELS[type.kind]} · {type.isPaid ? "dibayar" : "tidak dibayar"}
                  {type.usesQuota ? " · potong kuota" : ""} · {LEAVE_ATTACHMENT_LABELS[type.attachment].toLowerCase()}
                  {type.kind === "FULL_DAY" && type.backdateDays > 0 ? ` · mundur maks. ${type.backdateDays} hari` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <TypeActiveSwitch type={type} readOnly={readOnly} />
                {!readOnly && (
                  <Button
                    variant="edit"
                    size="icon-sm"
                    aria-label={`Ubah ${type.name}`}
                    title="Ubah"
                    onClick={() => setEditing(type.id)}
                  >
                    <PencilIcon />
                  </Button>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
      {!readOnly &&
        (editing === "new" ? (
          <div className="rounded-lg border p-3">
            <LeaveTypeForm onDone={() => setEditing(null)} />
          </div>
        ) : (
          <Button variant="brand" className="self-start" onClick={() => setEditing("new")}>
            <PlusIcon />
            Tambah jenis
          </Button>
        ))}
    </div>
  );
}

function LeaveTypeForm({ type, onDone }: { type?: LeaveType; onDone: () => void }) {
  const [pending, startSaving] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const [kind, setKind] = useState(type?.kind ?? "FULL_DAY");
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startSaving(async () => {
      const result = await saveLeaveType(type?.id ?? null, formData);
      if (!result.success) {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      notify.success(type ? "Jenis cuti/izin diperbarui." : "Jenis cuti/izin ditambahkan.");
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!fieldError("name")}>
            <FieldLabel htmlFor="leave-type-name">Nama</FieldLabel>
            <Input id="leave-type-name" name="name" defaultValue={type?.name} maxLength={60} required />
            <FieldError>{fieldError("name")}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="leave-type-kind">Bentuk</FieldLabel>
            <select
              id="leave-type-kind"
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
              className={selectClass}
            >
              {LEAVE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {LEAVE_KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="leave-type-attachment">Lampiran</FieldLabel>
            <select
              id="leave-type-attachment"
              name="attachment"
              defaultValue={type?.attachment ?? "NONE"}
              className={selectClass}
            >
              {LEAVE_ATTACHMENTS.map((value) => (
                <option key={value} value={value}>
                  {LEAVE_ATTACHMENT_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field data-invalid={!!fieldError("backdateDays")}>
            <FieldLabel htmlFor="leave-type-backdate">Boleh diajukan mundur</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="leave-type-backdate"
                name="backdateDays"
                type="number"
                min={0}
                max={30}
                defaultValue={type?.backdateDays ?? 0}
                className="w-20 tabular-nums"
                disabled={kind !== "FULL_DAY"}
              />
              <span className="text-sm text-muted-foreground">hari (0 = sebelum hari H)</span>
            </div>
            {kind !== "FULL_DAY" && <input type="hidden" name="backdateDays" value="0" />}
            <FieldError>{fieldError("backdateDays")}</FieldError>
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Field orientation="horizontal" className="w-auto">
            <Checkbox id="leave-type-paid" name="isPaid" defaultChecked={type?.isPaid ?? true} />
            <FieldLabel htmlFor="leave-type-paid" className="font-normal">
              Dibayar
            </FieldLabel>
          </Field>
          {kind === "FULL_DAY" && (
            <Field orientation="horizontal" className="w-auto">
              <Checkbox id="leave-type-quota" name="usesQuota" defaultChecked={type?.usesQuota ?? false} />
              <FieldLabel htmlFor="leave-type-quota" className="font-normal">
                Memotong kuota cuti tahunan
              </FieldLabel>
            </Field>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            Simpan
          </Button>
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Batal
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function TypeActiveSwitch({ type, readOnly }: { type: LeaveType; readOnly: boolean }) {
  const [pending, startSaving] = useTransition();
  const [active, setActive] = useState(type.isActive);
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={pending || readOnly}
        aria-label={`Status ${type.name}`}
        onCheckedChange={(next) =>
          startSaving(async () => {
            const result = await setLeaveTypeActive(type.id, next);
            if (result.success) setActive(next);
            else notify.error(result.message);
          })
        }
        className="data-checked:bg-emerald-600 dark:data-checked:bg-emerald-500"
      />
      <span className="text-sm text-muted-foreground">{active ? "Aktif" : "Nonaktif"}</span>
    </div>
  );
}

export type QuotaTableRow = {
  userId: string;
  fullName: string;
  photoId: string | null;
  customQuota: number | null;
  quota: number;
  used: number;
  pending: number;
  remaining: number;
};

export function LeaveQuotaTable({
  rows,
  companyQuota,
  canEdit,
}: {
  rows: QuotaTableRow[];
  companyQuota: number;
  canEdit: boolean;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Belum ada karyawan yang wajib absen.</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {rows.map((row) => (
        <QuotaRow key={row.userId} row={row} companyQuota={companyQuota} canEdit={canEdit} />
      ))}
    </ul>
  );
}

function QuotaRow({ row, companyQuota, canEdit }: { row: QuotaTableRow; companyQuota: number; canEdit: boolean }) {
  const [value, setValue] = useState(row.customQuota === null ? "" : String(row.customQuota));
  const [pending, startSaving] = useTransition();
  const dirty = value !== (row.customQuota === null ? "" : String(row.customQuota));
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
      <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
        <PersonAvatar name={row.fullName} photoId={row.photoId} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{row.fullName}</p>
          <p className="text-sm text-muted-foreground">
            Terpakai {row.used} · menunggu {row.pending} ·{" "}
            <span className="font-medium text-foreground">sisa {row.remaining}</span> dari {row.quota} hari
          </p>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`Cuti terpakai ${row.fullName}`}
            aria-valuemin={0}
            aria-valuemax={row.quota}
            aria-valuenow={Math.min(row.used, row.quota)}
          >
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${row.quota > 0 ? Math.min(100, ((row.used + row.pending) / row.quota) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>
      {canEdit ? (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={60}
            value={value}
            placeholder={String(companyQuota)}
            onChange={(event) => setValue(event.target.value)}
            className="w-20 tabular-nums"
            aria-label={`Kuota cuti ${row.fullName}`}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || pending}
            onClick={() =>
              startSaving(async () => {
                const result = await setUserLeaveQuota(row.userId, value);
                if (result.success) notify.success(`Kuota cuti ${row.fullName} disimpan.`);
                else notify.error(result.message);
              })
            }
          >
            {pending && <LoaderCircleIcon className="animate-spin" />}
            Simpan
          </Button>
        </div>
      ) : (
        <ToneBadge tone={row.remaining > 0 ? "success" : "warning"}>Sisa {row.remaining}</ToneBadge>
      )}
    </li>
  );
}
