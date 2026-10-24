// Form tambah pengguna: OWNER cukup mengisi nama, email, dan nomor WhatsApp.
// Setelah berhasil, form diganti panel sukses yang memberi tahu apakah email
// kredensial terkirim.
//
// Kenapa memakai onSubmit, bukan <form action={formAction}>?
// Dengan `action`, React mengosongkan form setelah Server Action selesai,
// termasuk saat validasi GAGAL, sehingga OWNER harus mengetik ulang semuanya.
// Dengan onSubmit + startTransition, isian tetap ada saat ada error.
//
// Referensi:
// - https://react.dev/reference/react-dom/components/form (bagian "Handle form submission")
// - https://react.dev/reference/react/useActionState

"use client";

import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { createUser, type CreateUserResult } from "@/features/users/actions";
import { TextField } from "./text-field";

export function UserCreateForm() {
  // Mengganti `key` membuat React membuat ulang form dari nol (state hasil
  // action ikut kosong). Dipakai untuk tombol "Tambah lagi".
  const [formKey, setFormKey] = useState(0);
  return <CreateForm key={formKey} onAddAnother={() => setFormKey((key) => key + 1)} />;
}

function CreateForm({ onAddAnother }: { onAddAnother: () => void }) {
  const [state, formAction, pending] = useActionState(createUser, undefined);

  if (state?.success) return <CreatedPanel result={state.data} onAddAnother={onAddAnother} />;

  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

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
        <TextField
          name="phoneNumber"
          label="Nomor WhatsApp"
          type="tel"
          inputMode="tel"
          placeholder="0812-3456-7890"
          description="Dipakai untuk notifikasi WhatsApp."
          required
          error={fieldError("phoneNumber")}
        />

        {error && !error.fieldErrors && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{error.message}</AlertTitle>
          </Alert>
        )}

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

function CreatedPanel({
  result,
  onAddAnother,
}: {
  result: CreateUserResult;
  onAddAnother: () => void;
}) {
  return (
    <div className="flex max-w-md flex-col gap-4">
      {result.emailSent ? (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>Pengguna berhasil dibuat</AlertTitle>
          <AlertDescription>
            Password sementara sudah dikirim ke <strong>{result.email}</strong>. Pengguna wajib
            menggantinya saat login pertama.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Pengguna dibuat, tetapi email gagal dikirim</AlertTitle>
          <AlertDescription>
            Buka detail pengguna lalu tekan &quot;Reset password&quot; untuk mengirim ulang
            password ke {result.email}.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href={`/users/${result.id}`} />}>
          Lihat detail
        </Button>
        <Button variant="outline" onClick={onAddAnother}>
          Tambah lagi
        </Button>
      </div>
    </div>
  );
}
