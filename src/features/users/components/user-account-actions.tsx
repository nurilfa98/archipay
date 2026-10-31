// Tombol "Reset password" dan "Nonaktifkan/Aktifkan" di halaman detail
// pengguna. Keduanya berdampak besar, jadi selalu meminta konfirmasi lewat
// AlertDialog sebelum Server Action dipanggil. Hasilnya tampil sebagai toast.
//
// Referensi:
// - https://ui.shadcn.com/docs/components/alert-dialog
// - node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
//   (bagian "Event Handlers")

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useState, useTransition, type ComponentProps } from "react";
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
import { resetUserPassword, setUserActive } from "@/features/users/actions";
import type { UserDetail } from "@/features/users/queries";

// Hanya ditampilkan untuk akun yang boleh dikelola (features/users/access.ts),
// jadi tidak pernah untuk akun sendiri.
export function UserAccountActions({ user }: { user: UserDetail }) {
  async function handleReset() {
    const result = await resetUserPassword(user.id);
    if (!result.success) notify.error(result.message);
    else if (result.data.emailSent) notify.success(`Password sementara baru sudah dikirim ke ${user.email}.`);
    else notify.warning("Password di-reset, tetapi email gagal dikirim. Coba reset lagi.");
  }

  async function handleToggleActive() {
    const result = await setUserActive(user.id, !user.isActive);
    if (!result.success) notify.error(result.message);
    else notify.success(user.isActive ? "Akun dinonaktifkan." : "Akun diaktifkan kembali.");
  }

  return (
    <div className="flex flex-col gap-4">
      <ActionRow
        title="Reset password"
        description={
          !user.isActive
            ? "Aktifkan akun terlebih dahulu untuk me-reset password."
            : "Kirim password sementara baru ke email pengguna. Pengguna akan keluar dari semua perangkat."
        }
      >
        <ConfirmButton
          label="Reset password"
          variant="outline"
          disabled={!user.isActive}
          dialogTitle={`Reset password ${user.fullName}?`}
          dialogDescription={`Password lama tidak berlaku lagi. Password sementara baru dikirim ke ${user.email}.`}
          confirmLabel="Reset password"
          onConfirm={handleReset}
        />
      </ActionRow>

      <ActionRow
        title={user.isActive ? "Nonaktifkan akun" : "Aktifkan akun"}
        description={
          user.isActive
            ? "Pengguna tidak bisa login, dan sesi yang sedang berjalan langsung berhenti. Data & riwayatnya tetap tersimpan."
            : "Pengguna bisa login kembali dengan password terakhirnya."
        }
      >
        <ConfirmButton
          label={user.isActive ? "Nonaktifkan" : "Aktifkan"}
          variant={user.isActive ? "destructive" : "outline"}
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
              variant={variant === "destructive" ? "destructive" : "brand"}
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
