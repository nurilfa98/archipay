// Logika logout yang dipakai bersama oleh menu user (navbar) dan halaman
// ganti password wajib.
//
// Setelah session dihapus, halaman di-reload penuh ke /login:
// - location.replace (bukan router.push) membuang semua halaman tersembunyi
//   & cache di memori browser (lihat komentar logout() di actions.ts)
// - "replace" juga menghapus entri riwayat, jadi tombol Back tidak kembali
//   ke halaman yang butuh login

"use client";

import { useTransition } from "react";
import { logout } from "@/features/auth/actions";

export function useLogout() {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logout();
      window.location.replace("/login");
    });
  }

  return { isPending, logout: handleLogout };
}
