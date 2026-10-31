// Form profil sendiri (menu Profil). Isinya sama dengan form data pengguna di
// halaman detail OWNER, tetapi tanpa pilihan role, karena role hanya diatur OWNER.
// Polanya sama dengan user-edit-form.tsx (onSubmit + startTransition agar isian
// tidak hilang saat validasi gagal). Hasil simpan tampil sebagai toast.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { startTransition, useActionState, type FormEvent } from "react";
import { useActionResult } from "@/hooks/use-action-result";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { updateOwnProfile } from "@/features/users/actions";
import type { UserDetail } from "@/features/users/queries";
import { BankAccountFields } from "@/components/bank-account-fields";
import { PhoneInput } from "@/components/phone-input";
import { notify } from "@/lib/notify";
import { TextField } from "./text-field";

export function ProfileForm({ user }: { user: UserDetail }) {
  const [state, formAction, pending] = useActionState(updateOwnProfile, undefined);

  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  useActionResult(state, (result) => {
    if (result.success) notify.success("Profil disimpan.");
    else if (!result.fieldErrors) notify.error(result.message);
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit}>
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
        <PhoneInput
          name="phoneNumber"
          label="Nomor WhatsApp"
          description="Dipakai untuk notifikasi uang muka dan pengingat."
          defaultValue={user.phoneNumber}
          required
          error={fieldError("phoneNumber")}
        />

        {/* Rekening dipakai Finance/Owner saat mencairkan uang muka lewat transfer */}
        <div className="grid gap-5 sm:grid-cols-2">
          <BankAccountFields
            defaultBankName={user.bankName}
            defaultAccountNumber={user.bankAccountNumber}
            bankNameError={fieldError("bankName")}
            accountError={fieldError("bankAccountNumber")}
          />
        </div>

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : "Simpan profil"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
