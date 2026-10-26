// Tombol + dialog konfirmasi untuk aksi uang muka (setujui, tolak, cairkan,
// batalkan, laporkan). Isian tambahan (alasan, referensi transfer) diletakkan
// di dalam dialog sebagai <form>, lalu FormData-nya dikirim ke `onConfirm`.
//
// Dialog tetap terbuka bila Server Action menolak (misal alasan terlalu
// pendek): error per isian tampil di bawah isiannya, error umum lewat toast.
// Bila berhasil, dialog tertutup dan `successMessage` tampil sebagai toast;
// revalidatePath() di Server Action membuat halaman menampilkan status terbaru.
//
// Referensi:
// - https://ui.shadcn.com/docs/components/alert-dialog
// - https://ui.shadcn.com/docs/components/base/toast

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useState, useTransition, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { notify } from "@/lib/notify";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/types/action-result";

type FieldErrorOf = (name: string) => string | undefined;

export function ActionDialog({
  label,
  icon,
  variant = "brand",
  disabled,
  title,
  description,
  confirmLabel,
  successMessage,
  onConfirm,
  children,
}: {
  label: string;
  // Diisi → tombol pemicu hanya berupa ikon; `label` menjadi aria-label & tooltip.
  icon?: ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  successMessage: string;
  onConfirm: (formData: FormData) => Promise<ActionResult>;
  children?: (fieldError: FieldErrorOf) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);

  const fieldError: FieldErrorOf = (name) => error?.fieldErrors?.[name]?.[0];

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await onConfirm(formData);
      if (result.success) {
        setOpen(false);
        notify.success(successMessage);
      } else {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
      }
    });
  }

  return (
    <>
      <Button
        variant={variant}
        size={icon ? "icon" : "default"}
        aria-label={icon ? label : undefined}
        title={icon ? label : undefined}
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
      >
        {icon ?? label}
      </Button>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <form onSubmit={handleSubmit} className="contents">
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            {children && <FieldGroup>{children(fieldError)}</FieldGroup>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
              <Button
                type="submit"
                variant={variant === "destructive" ? "destructive" : "brand"}
                disabled={pending}
              >
                {pending && <LoaderCircleIcon className="animate-spin" />}
                {confirmLabel}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Isian alasan (wajib) untuk tolak, batalkan, dan laporkan tidak sesuai.
export function ReasonField({
  label,
  placeholder,
  error,
}: {
  label: string;
  placeholder: string;
  error?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="reason">{label}</FieldLabel>
      <Textarea
        id="reason"
        name="reason"
        placeholder={placeholder}
        maxLength={500}
        aria-invalid={!!error}
        required
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}
