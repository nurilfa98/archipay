// Form pengajuan cuti/izin (halaman /attendance/leave/new), BUSINESS-FLOW §19.3.
// Isian menyesuaikan bentuk jenis yang dipilih: seharian (tanggal mulai–
// selesai) atau per jam (tanggal + jam). Jumlah hari kerja & sisa kuota
// dihitung ulang di server.

"use client";

import { LoaderCircleIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";
import { LEAVE_KIND_LABELS } from "../constants";
import { createLeaveRequest } from "../leave-actions";
import type { LeaveQuota, LeaveType } from "../leave-queries";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function LeaveRequestForm({ types, quota, today }: { types: LeaveType[]; quota: LeaveQuota; today: string }) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];
  const type = types.find((item) => item.id === typeId);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createLeaveRequest(formData);
      if (!result.success) {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      notify.success("Owner (dan Admin HR) diberi tahu lewat WhatsApp.", { title: "Pengajuan terkirim" });
      router.push("/attendance/leave");
    });
  }

  if (!type) return <p className="text-sm text-muted-foreground">Belum ada jenis cuti/izin aktif. Hubungi Owner.</p>;
  const hourly = type.kind !== "FULL_DAY";

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FieldGroup>
        <Field data-invalid={!!fieldError("leaveTypeId")}>
          <FieldLabel htmlFor="leaveTypeId">Jenis</FieldLabel>
          <select
            id="leaveTypeId"
            name="leaveTypeId"
            value={typeId}
            onChange={(event) => {
              setTypeId(event.target.value);
              setError(null);
            }}
            className={selectClass}
          >
            {types.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <FieldDescription>
            {LEAVE_KIND_LABELS[type.kind]} · {type.isPaid ? "dibayar" : "tidak dibayar"}
            {type.usesQuota ? ` · memotong kuota cuti (sisa ${quota.remaining} dari ${quota.quota} hari)` : ""}
            {type.kind === "FULL_DAY"
              ? type.backdateDays > 0
                ? ` · boleh diajukan mundur ${type.backdateDays} hari`
                : " · diajukan sebelum hari H"
              : " · diajukan sebelum absen hari itu"}
          </FieldDescription>
          <FieldError>{fieldError("leaveTypeId")}</FieldError>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!fieldError("startDate")}>
            <FieldLabel htmlFor="startDate">{hourly ? "Tanggal" : "Tanggal mulai"}</FieldLabel>
            <Input id="startDate" name="startDate" type="date" defaultValue={today} required />
            <FieldError>{fieldError("startDate")}</FieldError>
          </Field>
          {hourly ? (
            <Field data-invalid={!!fieldError("time")}>
              <FieldLabel htmlFor="time">
                {type.kind === "LATE_ARRIVAL" ? "Datang paling lambat" : "Pulang mulai"}
              </FieldLabel>
              <Input id="time" name="time" type="time" required />
              <FieldError>{fieldError("time")}</FieldError>
            </Field>
          ) : (
            <Field data-invalid={!!fieldError("endDate")}>
              <FieldLabel htmlFor="endDate">Tanggal selesai</FieldLabel>
              <Input id="endDate" name="endDate" type="date" />
              <FieldDescription>Kosongkan bila hanya satu hari. Hari libur tidak dihitung.</FieldDescription>
              <FieldError>{fieldError("endDate")}</FieldError>
            </Field>
          )}
        </div>

        <Field data-invalid={!!fieldError("reason")}>
          <FieldLabel htmlFor="reason">Alasan</FieldLabel>
          <Textarea id="reason" name="reason" maxLength={500} rows={3} required aria-invalid={!!fieldError("reason")} />
          <FieldError>{fieldError("reason")}</FieldError>
        </Field>

        {type.attachment !== "NONE" && (
          <Field data-invalid={!!fieldError("attachment")}>
            <FieldLabel htmlFor="attachment">
              Lampiran {type.attachment === "REQUIRED" ? "(wajib)" : "(opsional)"}
            </FieldLabel>
            <Input
              id="attachment"
              name="attachment"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required={type.attachment === "REQUIRED"}
            />
            <FieldDescription>Foto atau PDF, misal surat dokter. Maksimal 4 MB.</FieldDescription>
            <FieldError>{fieldError("attachment")}</FieldError>
          </Field>
        )}

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
            {pending ? "Mengirim..." : "Kirim pengajuan"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/attendance/leave" />}>
            Batal
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
