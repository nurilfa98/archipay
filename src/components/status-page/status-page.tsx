// Kerangka halaman status (error / tidak ditemukan): ilustrasi, label kecil,
// judul, penjelasan, lalu tombol-tombol di bawahnya.
//
// `standalone`: dipakai di luar layout aplikasi (halaman yang tidak dikenal,
// error di layout, global-error). Halaman memenuhi layar dan menampilkan logo,
// karena header aplikasi tidak ikut tampil.

import type { ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { cn } from "@/lib/utils";

export function StatusPage({
  illustration,
  label,
  title,
  description,
  children,
  standalone = false,
}: {
  illustration: ReactNode;
  label: string; // misal "404" atau "Terjadi kesalahan"
  title: string;
  description: ReactNode;
  children?: ReactNode; // tombol aksi
  standalone?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center",
        standalone && "min-h-svh bg-muted",
      )}
    >
      {standalone && <Brand />}
      {illustration}
      <div className="flex max-w-md flex-col gap-2">
        <p className="text-sm font-medium text-brand">{label}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {children && <div className="flex w-full max-w-md flex-col items-center gap-3">{children}</div>}
    </div>
  );
}
