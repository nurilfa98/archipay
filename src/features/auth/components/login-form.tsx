// Form login. Harus Client Component ("use client") karena memakai hook
// useActionState untuk menampilkan pesan error & status loading.
//
// Alurnya: submit → React memanggil Server Action `login` → hasil return-nya
// menjadi `state` → komponen render ulang dengan pesan error.
// Form tetap berfungsi walau JavaScript belum termuat (progressive enhancement).
//
// Komponen Field dari shadcn mengatur jarak label, input, dan pesan error.
// `data-invalid` di <Field> dan `aria-invalid` di <Input> membuat input
// berwarna merah saat ada error, dan dibaca oleh screen reader.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/forms.md
//   (bagian "Validation errors" & "Pending states")
// - https://react.dev/reference/react/useActionState
// - https://ui.shadcn.com/docs/components/field

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { login } from "@/features/auth/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);

  // React mengosongkan form otomatis setelah Server Action selesai.
  // Email dibuat "controlled" (disimpan di state) supaya tidak ikut terhapus
  // saat password salah; password tetap dikosongkan demi keamanan.
  const [email, setEmail] = useState("");

  const error = state && !state.success ? state : undefined;
  const emailError = error?.fieldErrors?.email?.[0];
  const passwordError = error?.fieldErrors?.password?.[0];

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field data-invalid={!!emailError}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="nama@perusahaan.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!emailError}
          />
          <FieldError>{emailError}</FieldError>
        </Field>

        <Field data-invalid={!!passwordError}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={!!passwordError}
          />
          <FieldError>{passwordError}</FieldError>
        </Field>

        {/* Sesi 14 hari bila dicentang; tanpa centang, sesi berakhir saat browser
            ditutup (atau setelah 12 jam). Server membaca value="1". */}
        <Field orientation="horizontal">
          <Checkbox id="rememberMe" name="rememberMe" value="1" />
          <FieldLabel htmlFor="rememberMe" className="font-normal">
            Ingat saya 
          </FieldLabel>
        </Field>

        {/* Error umum (email/password salah, rate limit). role="alert"
            membuat screen reader langsung membacakan pesan ini. */}
        {error && !error.fieldErrors && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        )}

        <Field>
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Memproses..." : "Masuk"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
