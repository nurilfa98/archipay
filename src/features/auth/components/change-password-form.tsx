// Form ganti password. Polanya sama dengan login-form.tsx: useActionState +
// Server Action `changePassword`.
//
// Input email tersembunyi (autoComplete="username") membantu password manager
// di browser/HP menyimpan password baru untuk akun yang benar.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/forms.md
// - https://web.dev/articles/sign-in-form-best-practices (autocomplete password)

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePassword } from "@/features/auth/actions";

const FIELDS = [
  { name: "currentPassword", label: "Password saat ini", autoComplete: "current-password" },
  { name: "newPassword", label: "Password baru", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Ulangi password baru", autoComplete: "new-password" },
] as const;

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(changePassword, undefined);
  const error = state && !state.success ? state : undefined;

  return (
    <form action={formAction}>
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <FieldGroup>
        {FIELDS.map((field) => {
          const fieldError = error?.fieldErrors?.[field.name]?.[0];
          return (
            <Field key={field.name} data-invalid={!!fieldError}>
              <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete={field.autoComplete}
                required
                aria-invalid={!!fieldError}
              />
              {field.name === "newPassword" && !fieldError && (
                <FieldDescription>Minimal 8 karakter.</FieldDescription>
              )}
              <FieldError>{fieldError}</FieldError>
            </Field>
          );
        })}

        <Field>
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : "Simpan password baru"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
