// Judul + deskripsi di bagian atas setiap halaman, supaya tampilannya seragam.
//
// Komponen ini statis (tidak membaca cookie/database), jadi ikut dirender saat
// build dan ikut di-prefetch. Saat link di sidebar diklik, judul halaman
// langsung muncul tanpa menunggu server.

// `action` (opsional) = tombol di kanan judul, misalnya "Tambah pengguna".
// Di HP tombol turun ke bawah judul.

import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
