// Tidak menampilkan apa pun. Dipasang di root layout hanya agar modul
// use-install-app.ts dimuat sejak halaman pertama kali terbuka, sehingga event
// `beforeinstallprompt` dari browser tidak terlewat (lihat penjelasan di modul itu).

"use client";

import "@/features/pwa/hooks/use-install-app";

export function InstallAppListener() {
  return null;
}
