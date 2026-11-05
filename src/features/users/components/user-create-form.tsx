// Form tambah pengguna: cukup mengisi nama, email, dan role awal. Pilihan role
// berasal dari features/users/access.ts (superadmin bisa memilih Owner, Owner
// hanya Finance/Karyawan). Nomor WhatsApp dan rekening diisi belakangan.
// Setelah berhasil, kembali ke daftar /users dan toast singkat memberi tahu
// apakah email password sementara terkirim (dengan tombol "Lihat detail").
//
// Kenapa memakai onSubmit, bukan <form action={formAction}>?
// Dengan `action`, React mengosongkan form setelah Server Action selesai,
// termasuk saat validasi GAGAL, sehingga OWNER harus mengetik ulang semuanya.
// Dengan onSubmit + startTransition, isian tetap ada saat ada error.
//
// Referensi:
// - https://react.dev/reference/react-dom/components/form (bagian "Handle form submission")
// - https://react.dev/reference/react/useActionState
// - https://ui.shadcn.com/docs/components/base/toast

"use client";

import { LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, type FormEvent } from "react";
import { useActionResult } from "@/hooks/use-action-result";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createUser, type CreateUserResult } from "@/features/users/actions";
import { ROLE_LABELS, type AssignableRole } from "@/lib/auth/roles";
import { TextField } from "./text-field";

export function UserCreateForm({ roles }: { roles: AssignableRole[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createUser, undefined);

  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  useActionResult(state, (result) => {
    if (!result.success) {
      if (!result.fieldErrors) notify.error(result.message);
      return;
    }
    showCreatedToast(result.data, () => router.push(`/users/${result.data.id}`));
    router.push("/users");
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <FieldGroup>
        <TextField
          name="fullName"
          label="Nama lengkap"
          autoComplete="off"
          required
          error={fieldError("fullName")}
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="off"
          description="Password sementara dikirim ke email ini."
          required
          error={fieldError("email")}
        />

        <FieldSet data-invalid={!!fieldError("role")}>
          <FieldLegend variant="label">Role</FieldLegend>
          <RadioGroup name="role" defaultValue="EMPLOYEE">
            {roles.map((role) => (
              <Field key={role} orientation="horizontal">
                <RadioGroupItem value={role} id={`role-${role}`} />
                <FieldLabel htmlFor={`role-${role}`} className="font-normal">
                  {ROLE_LABELS[role]}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
          <FieldError>{fieldError("role")}</FieldError>
        </FieldSet>

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/users" />}>
            Batal
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

function showCreatedToast(result: CreateUserResult, openDetail: () => void) {
  const action = { label: "Lihat detail", onClick: openDetail };
  if (result.emailSent) {
    notify.success(`Password sementara dikirim ke ${result.email}.`, { title: "Pengguna berhasil dibuat", action });
  } else {
    notify.warning(`Password sementara gagal dikirim ke ${result.email}.`, {
      title: "Pengguna dibuat, tetapi email gagal dikirim",
      timeout: 10000,
      action,
    });
  }
}
