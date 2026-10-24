// Tombol "Reset password" dan "Nonaktifkan/Aktifkan" di halaman detail
// pengguna. Keduanya berdampak besar, jadi selalu meminta konfirmasi lewat
// AlertDialog sebelum Server Action dipanggil.
//
// Referensi:
// - https://ui.shadcn.com/docs/components/alert-dialog
// - node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
//   (bagian "Event Handlers")

"use client";

import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon } from "lucide-react";
import { useState, useTransition, type ComponentProps } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
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
import { resetUserPassword, setUserActive } from "@/features/users/actions";
import type { UserDetail } from "@/features/users/queries";

type Feedback = { ok: boolean; text: string };

export function UserAccountActions({ user, isSelf }: { user: UserDetail; isSelf: boolean }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function handleReset() {
    const result = await resetUserPassword(user.id);
    if (!result.success) return setFeedback({ ok: false, text: result.message });
    setFeedback(
      result.data.emailSent
        ? { ok: true, text: `Password sementara baru sudah dikirim ke ${user.email}.` }
        : { ok: false, text: "Password di-reset, tetapi email gagal dikirim. Coba reset lagi." },
    );
  }

  async function handleToggleActive() {
    const result = await setUserActive(user.id, !user.isActive);
    if (!result.success) return setFeedback({ ok: false, text: result.message });
    setFeedback({ ok: true, text: user.isActive ? "Akun dinonaktifkan." : "Akun diaktifkan kembali." });
  }

  return (
    <div className="flex flex-col gap-4">
      <ActionRow
        title="Reset password"
        description={
          isSelf
            ? "Untuk akun sendiri, gunakan menu Ganti password di pojok kanan atas."
            : !user.isActive
              ? "Aktifkan akun terlebih dahulu untuk me-reset password."
              : "Kirim password sementara baru ke email pengguna. Pengguna akan keluar dari semua perangkat."
        }
      >
        <ConfirmButton
          label="Reset password"
          variant="outline"
          disabled={isSelf || !user.isActive}
          dialogTitle={`Reset password ${user.fullName}?`}
          dialogDescription={`Password lama tidak berlaku lagi. Password sementara baru dikirim ke ${user.email}.`}
          confirmLabel="Reset password"
          onConfirm={handleReset}
        />
      </ActionRow>

      <ActionRow
        title={user.isActive ? "Nonaktifkan akun" : "Aktifkan akun"}
        description={
          isSelf
            ? "Anda tidak bisa menonaktifkan akun sendiri."
            : user.isActive
              ? "Pengguna tidak bisa login, dan sesi yang sedang berjalan langsung berhenti. Data & riwayatnya tetap tersimpan."
              : "Pengguna bisa login kembali dengan password terakhirnya."
        }
      >
        <ConfirmButton
          label={user.isActive ? "Nonaktifkan" : "Aktifkan"}
          variant={user.isActive ? "destructive" : "outline"}
          disabled={isSelf}
          dialogTitle={user.isActive ? `Nonaktifkan ${user.fullName}?` : `Aktifkan ${user.fullName}?`}
          dialogDescription={
            user.isActive
              ? "Pengguna langsung tidak bisa memakai aplikasi. Anda bisa mengaktifkannya kembali kapan saja."
              : "Pengguna bisa login kembali."
          }
          confirmLabel={user.isActive ? "Nonaktifkan" : "Aktifkan"}
          onConfirm={handleToggleActive}
        />
      </ActionRow>

      {feedback && (
        <Alert variant={feedback.ok ? "default" : "destructive"}>
          {feedback.ok ? <CircleCheckIcon /> : <CircleAlertIcon />}
          <AlertTitle>{feedback.text}</AlertTitle>
        </Alert>
      )}
    </div>
  );
}

function ActionRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// Tombol + dialog konfirmasi. Dialog tetap terbuka (dengan spinner) selama
// Server Action berjalan, lalu tertutup setelah selesai.
function ConfirmButton({
  label,
  variant,
  disabled,
  dialogTitle,
  dialogDescription,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  variant: ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
  dialogTitle: string;
  dialogDescription: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await onConfirm();
      setOpen(false);
    });
  }

  return (
    <>
      <Button variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button
              variant={variant === "destructive" ? "destructive" : "default"}
              disabled={pending}
              onClick={handleConfirm}
            >
              {pending && <LoaderCircleIcon className="animate-spin" />}
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
