// Tombol Superadmin di detail error: tandai Selesai, Abaikan, atau buka lagi.
// Berlaku untuk seluruh kelompok (semua kejadian dengan fingerprint sama).

"use client";

import { CheckIcon, EyeOffIcon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { setErrorGroupStatus } from "../actions";
import type { ErrorStatus } from "../constants";

function NoteField({ error }: { error?: string }) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="error-note">Catatan (opsional)</FieldLabel>
      <Input
        id="error-note"
        name="note"
        maxLength={500}
        autoComplete="off"
        placeholder="Misal: diperbaiki di v606afc2"
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

// listHref: daftar error beserta filter yang sedang dipakai; setelah "Tandai selesai"
// atau "Abaikan" Superadmin langsung diantar ke sana.
export function ErrorStatusButtons({
  fingerprint,
  status,
  listHref,
}: {
  fingerprint: string;
  status: ErrorStatus;
  listHref: string;
}) {
  const router = useRouter();
  const backToList = () => router.push(listHref);
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "RESOLVED" && (
        <ActionDialog
          label="Tandai selesai"
          icon={<CheckIcon />}
          showLabel
          title="Tandai error ini selesai?"
          description="Bila muncul lagi, error otomatis kembali berstatus Baru."
          confirmLabel="Tandai selesai"
          successMessage="Error ditandai selesai."
          onConfirm={(formData) => setErrorGroupStatus(fingerprint, "RESOLVED", formData)}
          onSuccess={backToList}
        >
          {(fieldError) => <NoteField error={fieldError("note")} />}
        </ActionDialog>
      )}
      {status !== "IGNORED" && (
        <ActionDialog
          label="Abaikan"
          icon={<EyeOffIcon />}
          showLabel
          variant="outline"
          title="Abaikan error ini?"
          description="Kejadian berikutnya tetap dicatat, tetapi tidak muncul sebagai masalah Baru."
          confirmLabel="Abaikan"
          successMessage="Error diabaikan."
          onConfirm={(formData) => setErrorGroupStatus(fingerprint, "IGNORED", formData)}
          onSuccess={backToList}
        >
          {(fieldError) => <NoteField error={fieldError("note")} />}
        </ActionDialog>
      )}
      {status !== "NEW" && (
        <ActionDialog
          label="Buka lagi"
          icon={<RotateCcwIcon />}
          showLabel
          variant="outline"
          title="Buka lagi error ini?"
          description="Status kembali Baru."
          confirmLabel="Buka lagi"
          successMessage="Error dibuka lagi."
          onConfirm={() => setErrorGroupStatus(fingerprint, "NEW")}
        />
      )}
    </div>
  );
}
