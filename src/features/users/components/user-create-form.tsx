// Form tambah pengguna: OWNER cukup mengisi nama dan email. Nomor WhatsApp
// dan rekening diisi belakangan lewat halaman edit pengguna.
// Setelah berhasil, toast memberi tahu apakah email kredensial terkirim
// (dengan tombol "Lihat detail"), lalu form dikosongkan untuk pengguna berikutnya.
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
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { createUser, type CreateUserResult } from "@/features/users/actions";
import { TextField } from "./text-field";

export function UserCreateForm() {
  // Mengganti `key` membuat React membuat ulang form dari nol (isian & state
  // hasil action ikut kosong). Dipakai setelah pengguna berhasil dibuat.
  const [formKey, setFormKey] = useState(0);
  return <CreateForm key={formKey} onCreated={() => setFormKey((key) => key + 1)} />;
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createUser, undefined);

  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  useEffect(() => {
    if (!state) return;
    if (!state.success) {
      if (!state.fieldErrors) notify.error(state.message);
      return;
    }
    showCreatedToast(state.data, () => router.push(`/users/${state.data.id}`));
    onCreated();
  }, [state, router, onCreated]);

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
    notify.success(
      `Password sementara sudah dikirim ke ${result.email}. Pengguna wajib menggantinya saat login pertama.`,
      { title: "Pengguna berhasil dibuat", action },
    );
  } else {
    notify.warning(
      `Buka detail pengguna lalu tekan "Reset password" untuk mengirim ulang password ke ${result.email}.`,
      { title: "Pengguna dibuat, tetapi email gagal dikirim", timeout: 10000, action },
    );
  }
}
