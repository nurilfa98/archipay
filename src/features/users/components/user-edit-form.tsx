// Form edit data & role pengguna. Polanya sama dengan user-create-form.tsx
// (onSubmit + startTransition agar isian tidak hilang saat validasi gagal).
// Hasil simpan (berhasil / error umum) tampil sebagai toast.
//
// Role memakai Checkbox Base UI: setiap checkbox yang dicentang mengirim
// name="roles" value="OWNER" (dst), lalu dibaca server dengan
// formData.getAll("roles").
//
// Referensi:
// - https://ui.shadcn.com/docs/components/checkbox
// - https://ui.shadcn.com/docs/components/field (bagian "Checkbox")

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { notify } from "@/lib/notify";
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
import { updateUser } from "@/features/users/actions";
import type { UserDetail } from "@/features/users/queries";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { formatPhone } from "@/lib/phone";
import { TextField } from "./text-field";

export function UserEditForm({ user, isSelf }: { user: UserDetail; isSelf: boolean }) {
  const [state, formAction, pending] = useActionState(updateUser, undefined);

  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  useEffect(() => {
    if (state?.success) notify.success("Perubahan disimpan.");
    else if (state && !state.fieldErrors) notify.error(state.message);
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="userId" value={user.id} />
      <FieldGroup>
        <TextField
          name="fullName"
          label="Nama lengkap"
          defaultValue={user.fullName}
          autoComplete="off"
          required
          error={fieldError("fullName")}
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          defaultValue={user.email}
          autoComplete="off"
          required
          error={fieldError("email")}
        />
        <TextField
          name="phoneNumber"
          label="Nomor WhatsApp"
          type="tel"
          inputMode="tel"
          placeholder="0812-3456-7890"
          defaultValue={user.phoneNumber ? formatPhone(user.phoneNumber) : ""}
          required
          error={fieldError("phoneNumber")}
        />

        {/* Rekening dipakai Finance saat mencairkan uang muka lewat transfer */}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="bankName"
            label="Nama bank"
            placeholder="BCA"
            defaultValue={user.bankName ?? ""}
            autoComplete="off"
            error={fieldError("bankName")}
          />
          <TextField
            name="bankAccountNumber"
            label="Nomor rekening"
            inputMode="numeric"
            defaultValue={user.bankAccountNumber ?? ""}
            autoComplete="off"
            error={fieldError("bankAccountNumber")}
          />
        </div>

        <FieldSet data-invalid={!!fieldError("roles")}>
          <FieldLegend variant="label">Role</FieldLegend>
          {/* key: setelah disimpan, server mengirim role terbaru. Checkbox
              uncontrolled tidak boleh diganti defaultChecked-nya, jadi
              grupnya dibuat ulang bila daftar role berubah. */}
          <FieldGroup data-slot="checkbox-group" key={user.roles.toSorted().join()}>
            {ROLES.map((role) => {
              // Role Owner akun sendiri dikunci. Checkbox yang disabled tidak
              // ikut terkirim, jadi nilainya dikirim lewat input tersembunyi.
              const locked = isSelf && role === "OWNER";
              return (
                <Field key={role} orientation="horizontal" data-disabled={locked}>
                  <Checkbox
                    id={`role-${role}`}
                    name="roles"
                    value={role}
                    defaultChecked={user.roles.includes(role)}
                    disabled={locked}
                  />
                  {locked && <input type="hidden" name="roles" value={role} />}
                  <FieldLabel htmlFor={`role-${role}`} className="font-normal">
                    {ROLE_LABELS[role]}
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldGroup>
          {isSelf && !fieldError("roles") && (
            <FieldDescription>Role Owner pada akun sendiri tidak bisa dilepas.</FieldDescription>
          )}
          <FieldError>{fieldError("roles")}</FieldError>
        </FieldSet>

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : "Simpan perubahan"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
