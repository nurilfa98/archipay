// Tombol "Ajukan uang muka" untuk karyawan yang sudah mencapai batas uang muka
// tertunda, plus kartu info yang tampil di halaman daftar setelah tombol diklik.
// Karyawan tidak perlu membuka form hanya untuk melihat bahwa ia terblokir.
//
// Tombol (di judul halaman) dan kartu (di bawah judul) berada di tempat yang
// berbeda, jadi keduanya berbagi state lewat provider yang membungkus halaman.
// Angkanya dikirim tombol saat diklik, sehingga tidak perlu query ulang.

"use client";

import { CircleAlertIcon, PlusIcon } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Blocked = { overdue: number; limit: number };

const BlockedContext = createContext<{
  blocked: Blocked | null;
  show: (blocked: Blocked) => void;
} | null>(null);

export function RequestBlockedProvider({ children }: { children: ReactNode }) {
  const [blocked, show] = useState<Blocked | null>(null);
  return <BlockedContext value={{ blocked, show }}>{children}</BlockedContext>;
}

export function RequestBlockedButton({
  variant,
  label,
  overdue,
  limit,
}: {
  variant: "outline" | "brand";
  label: string;
} & Blocked) {
  const context = useContext(BlockedContext);
  return (
    <Button type="button" variant={variant} onClick={() => context?.show({ overdue, limit })}>
      <PlusIcon />
      {label}
    </Button>
  );
}

export function RequestBlockedNotice() {
  const blocked = useContext(BlockedContext)?.blocked;
  if (!blocked) return null;

  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>Belum bisa menerima uang muka baru</AlertTitle>
      <AlertDescription>
        {`Anda masih memiliki ${blocked.overdue} uang muka yang belum dipertanggungjawabkan melewati batas unggah nota (batas: ${blocked.limit}). Kirimkan pertanggungjawaban dulu.`}
      </AlertDescription>
    </Alert>
  );
}
