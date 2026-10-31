// Pembantu form langganan: useActionState + toast hasil simpan, sama seperti
// form Pengaturan (company-settings-form.tsx). onSubmit + startTransition
// dipakai agar isian tidak dikosongkan React saat validasi gagal. Toast lewat
// useActionResult agar tidak muncul lagi saat kembali ke halaman ini.

"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { useActionResult } from "@/hooks/use-action-result";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";

export function useFormAction(
  action: (state: ActionResult | undefined, formData: FormData) => Promise<ActionResult>,
  successMessage: string,
  onSuccess?: () => void,
) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const error = state && !state.success ? state : undefined;

  useActionResult(state, (result) => {
    if (result.success) {
      notify.success(successMessage);
      onSuccess?.();
    } else if (!result.fieldErrors) notify.error(result.message);
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return {
    pending,
    handleSubmit,
    fieldError: (name: string) => error?.fieldErrors?.[name]?.[0],
  };
}
