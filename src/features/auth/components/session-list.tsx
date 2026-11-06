// Daftar "Perangkat yang sedang login" di menu Profil (BUSINESS-FLOW §2.1).
// Setiap perangkat lain punya tombol Keluarkan (wajib password), ditambah
// "Keluarkan semua perangkat lain". Perangkat ini ditandai dan keluar lewat
// tombol Keluar di menu pengguna. Tanggal sudah diformat di server.

"use client";

import { LogOutIcon, MonitorIcon, SmartphoneIcon } from "lucide-react";
import { ToneBadge } from "@/components/tone-badge";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { revokeOtherSessions, revokeSession } from "../session-actions";

export type SessionRow = {
  id: string;
  deviceLabel: string;
  location: string | null;
  createdAtLabel: string; // "24 Okt 2026, 15.30 WIB"
  current: boolean;
};

const isPhone = (label: string) => /Android|iPhone|iPad|dalam aplikasi/.test(label);

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const others = sessions.filter((session) => !session.current).length;
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-lg border">
        {sessions.map((session) => {
          const Icon = isPhone(session.deviceLabel) ? SmartphoneIcon : MonitorIcon;
          return (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {session.deviceLabel}
                    {session.current && <ToneBadge tone="success">Perangkat ini</ToneBadge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {session.location ?? "Lokasi tidak diketahui"} · Login {session.createdAtLabel}
                  </p>
                </div>
              </div>
              {!session.current && (
                <ActionDialog
                  label="Keluarkan"
                  icon={<LogOutIcon />}
                  showLabel
                  size="sm"
                  variant="outline"
                  title={`Keluarkan ${session.deviceLabel}?`}
                  description="Perangkat itu langsung keluar dari akun Anda. Masukkan password Anda untuk konfirmasi."
                  confirmLabel="Keluarkan"
                  successMessage="Perangkat dikeluarkan."
                  onConfirm={(formData) => revokeSession(session.id, formData)}
                >
                  {(fieldError) => <PasswordField id={`password-${session.id}`} error={fieldError("password")} />}
                </ActionDialog>
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 && (
        <div>
          <ActionDialog
            label="Keluarkan semua perangkat lain"
            icon={<LogOutIcon />}
            showLabel
            variant="destructive"
            title="Keluarkan semua perangkat lain?"
            description={`${others} perangkat lain langsung keluar dari akun Anda; hanya perangkat ini yang tetap login. Masukkan password Anda untuk konfirmasi.`}
            confirmLabel="Keluarkan semua"
            successMessage="Semua perangkat lain dikeluarkan."
            onConfirm={(formData) => revokeOtherSessions(formData)}
          >
            {(fieldError) => <PasswordField id="password-all" error={fieldError("password")} />}
          </ActionDialog>
        </div>
      )}
    </div>
  );
}

function PasswordField({ id, error }: { id: string; error?: string }) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>Password Anda</FieldLabel>
      <Input
        id={id}
        name="password"
        type="password"
        autoComplete="current-password"
        aria-invalid={!!error}
        required
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}
