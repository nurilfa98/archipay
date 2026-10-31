// Form tambah & edit company (khusus Superadmin). Tanpa prop `company` = mode
// tambah: data company + Owner pertama (nama & email; password sementara
// dikirim ke email Owner). Dengan `company` = mode edit data company saja.
//
// Kenapa memakai onSubmit, bukan <form action={formAction}>?
// Dengan `action`, React mengosongkan form setelah Server Action selesai,
// termasuk saat validasi GAGAL, sehingga isian harus diketik ulang. Dengan
// onSubmit + startTransition, isian tetap ada saat ada error.
//
// Referensi:
// - https://react.dev/reference/react-dom/components/form (bagian "Handle form submission")
// - https://react.dev/reference/react/useActionState

"use client";

import { LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { createCompany, updateCompany } from "@/features/companies/actions";
import type { CompanyDetail } from "@/features/companies/queries";
import { TextField } from "@/features/users/components/text-field";
import { notify } from "@/lib/notify";
import { PhoneInput } from "@/components/phone-input";

type CompanyFormProps = { company: Pick<CompanyDetail, "id" | "name" | "address" | "phoneNumber"> };

export function CompanyCreateForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createCompany, undefined);
  const fieldError = (name: string) => (state && !state.success ? state.fieldErrors?.[name]?.[0] : undefined);

  useEffect(() => {
    if (!state) return;
    if (!state.success) {
      if (!state.fieldErrors) notify.error(state.message);
      return;
    }
    if (state.data.emailSent) {
      notify.success(`Password sementara Owner sudah dikirim ke ${state.data.ownerEmail}.`, {
        title: "Company berhasil dibuat",
      });
    } else {
      notify.warning(
        `Buka company ini, lalu di menu Pengguna tekan "Reset password" pada akun Owner untuk mengirim ulang password ke ${state.data.ownerEmail}.`,
        { title: "Company dibuat, tetapi email Owner gagal dikirim", timeout: 10000 },
      );
    }
    router.push(`/companies/${state.data.id}`);
  }, [state, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FieldGroup>
        <CompanyFields fieldError={fieldError} />

        <FieldSet>
          <FieldLegend>Owner pertama</FieldLegend>
          <FieldGroup>
            <TextField name="ownerName" label="Nama lengkap" autoComplete="off" required error={fieldError("ownerName")} />
            <TextField
              name="ownerEmail"
              label="Email"
              type="email"
              autoComplete="off"
              description="Password sementara dikirim ke email ini. Owner lain bisa ditambahkan nanti dari menu Pengguna."
              required
              error={fieldError("ownerEmail")}
            />
          </FieldGroup>
        </FieldSet>

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : "Buat company"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/companies" />}>
            Batal
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

export function CompanyEditForm({ company }: CompanyFormProps) {
  const [state, formAction, pending] = useActionState(updateCompany, undefined);
  const fieldError = (name: string) => (state && !state.success ? state.fieldErrors?.[name]?.[0] : undefined);

  useEffect(() => {
    if (state?.success) notify.success("Data company disimpan.");
    else if (state && !state.fieldErrors) notify.error(state.message);
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <input type="hidden" name="companyId" value={company.id} />
      <FieldGroup>
        <CompanyFields company={company} fieldError={fieldError} />
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

function CompanyFields({
  company,
  fieldError,
}: {
  company?: CompanyFormProps["company"];
  fieldError: (name: string) => string | undefined;
}) {
  return (
    <>
      <TextField
        name="name"
        label="Nama company"
        defaultValue={company?.name}
        placeholder="PT Maju Bersama"
        autoComplete="off"
        required
        error={fieldError("name")}
      />
      <Field data-invalid={!!fieldError("address")}>
        <FieldLabel htmlFor="address">Alamat</FieldLabel>
        <Textarea
          id="address"
          name="address"
          defaultValue={company?.address ?? ""}
          rows={2}
          aria-invalid={!!fieldError("address")}
        />
        <FieldError>{fieldError("address")}</FieldError>
      </Field>
      <PhoneInput
        name="phoneNumber"
        label="Nomor telepon / WhatsApp kantor"
        defaultValue={company?.phoneNumber}
        error={fieldError("phoneNumber")}
      />
    </>
  );
}
