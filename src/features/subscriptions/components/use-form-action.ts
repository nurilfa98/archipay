// Pembantu form langganan: useActionState + toast hasil simpan, sama seperti
// form Pengaturan (company-settings-form.tsx). onSubmit + startTransition
// dipakai agar isian tidak dikosongkan React saat validasi gagal.

"use client";

import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";

export function useFormAction(
  action: (state: ActionResult | undefined, formData: FormData) => Promise<ActionResult>,
  successMessage: string,
  onSuccess?: () => void,
) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const error = state && !state.success ? state : undefined;

  useEffect(() => {
    if (state?.success) {
      notify.success(successMessage);
      onSuccess?.();
    } else if (state && !state.fieldErrors) notify.error(state.message);
    // onSuccess sengaja tidak masuk dependency: cukup bereaksi pada hasil baru.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, successMessage]);

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
