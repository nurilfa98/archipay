// Form profil sendiri (menu Profil). Isinya sama dengan form data pengguna di
// halaman detail OWNER, tetapi tanpa pilihan role, karena role hanya diatur OWNER.
// Email dan nomor WhatsApp tampil baca saja: email hanya diubah Owner (akun Owner:
// admin ArchiPay), nomor lewat /verify-phone (kode OTP). Email adalah jangkar
// kepemilikan akun, jadi tidak bisa diganti dari sesi yang sedang login.
// Polanya sama dengan user-edit-form.tsx (onSubmit + startTransition agar isian
// tidak hilang saat validasi gagal). Hasil simpan tampil sebagai toast.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { useActionResult } from "@/hooks/use-action-result";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { updateOwnProfile } from "@/features/users/actions";
import type { UserDetail } from "@/features/users/queries";
import { BankAccountFields } from "@/components/bank-account-fields";
import { formatPhone } from "@/lib/phone";
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
        <Field>
          <FieldLabel>Email</FieldLabel>
          <p className="text-sm">{user.email}</p>
          <FieldDescription>
            Dipakai untuk login dan menerima password sementara. Email hanya bisa diubah oleh{" "}
            {user.roles.includes("OWNER") ? "admin ArchiPay" : "Owner"}.
          </FieldDescription>
        </Field>
        {/* Nomor WhatsApp hanya bisa diganti lewat verifikasi kode OTP. */}
        <Field>
          <FieldLabel>Nomor WhatsApp</FieldLabel>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm tabular-nums">{user.phoneNumber ? formatPhone(user.phoneNumber) : "Belum diisi"}</span>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/verify-phone?from=profile" />}>
              Ganti nomor
            </Button>
          </div>
          <FieldDescription>
            Dipakai untuk notifikasi uang muka, pengingat, dan absensi. Nomor baru wajib diverifikasi dengan kode
            yang dikirim lewat WhatsApp.
          </FieldDescription>
        </Field>

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
