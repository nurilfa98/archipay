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
import { startTransition, useActionState, type FormEvent } from "react";
import { useActionResult } from "@/hooks/use-action-result";
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
import { ROLE_LABELS, type AssignableRole } from "@/lib/auth/roles";
import { BankAccountFields } from "@/components/bank-account-fields";
import { formatPhone } from "@/lib/phone";
import { TextField } from "./text-field";

// `roles` = role yang boleh diberikan pengelola (features/users/access.ts).
// canEditBank = false (Admin HR): rekening bank tampil tetapi tidak bisa diubah;
// server juga mengabaikan isiannya (features/users/actions.ts).
export function UserEditForm({
  user,
  roles,
  canEditBank,
}: {
  user: UserDetail;
  roles: AssignableRole[];
  canEditBank: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateUser, undefined);

  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  useActionResult(state, (result) => {
    if (result.success) notify.success("Perubahan disimpan.");
    else if (!result.fieldErrors) notify.error(result.message);
  });

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
        <Field>
          <FieldLabel>Nomor WhatsApp</FieldLabel>
          <p className="text-sm">{user.phoneNumber ? formatPhone(user.phoneNumber) : "Belum diisi"}</p>
          <FieldDescription>
            Diisi & diverifikasi pengguna sendiri dengan kode OTP WhatsApp saat login, atau lewat menu Profil.
          </FieldDescription>
        </Field>

        {/* Rekening dipakai Finance saat mencairkan uang muka lewat transfer */}
        <fieldset disabled={!canEditBank} className="grid min-w-0 gap-5 sm:grid-cols-2">
          <BankAccountFields
            defaultBankName={user.bankName}
            defaultAccountNumber={user.bankAccountNumber}
            bankNameError={fieldError("bankName")}
            accountError={fieldError("bankAccountNumber")}
          />
        </fieldset>
        {!canEditBank && (
          <p className="-mt-3 text-sm text-muted-foreground">
            Rekening bank hanya bisa diubah oleh Owner atau pengguna sendiri lewat menu Profil.
          </p>
        )}

        <FieldSet data-invalid={!!fieldError("roles")}>
          <FieldLegend variant="label">Role</FieldLegend>
          {/* key: setelah disimpan, server mengirim role terbaru. Checkbox
              uncontrolled tidak boleh diganti defaultChecked-nya, jadi
              grupnya dibuat ulang bila daftar role berubah. */}
          <FieldGroup data-slot="checkbox-group" key={user.roles.toSorted().join()}>
            {roles.map((role) => (
              <Field key={role} orientation="horizontal">
                <Checkbox
                  id={`role-${role}`}
                  name="roles"
                  value={role}
                  defaultChecked={user.roles.includes(role)}
                />
                <FieldLabel htmlFor={`role-${role}`} className="font-normal">
                  {ROLE_LABELS[role]}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
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
