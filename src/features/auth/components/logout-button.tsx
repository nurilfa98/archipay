// Tombol Keluar versi biasa (bukan item dropdown), dipakai di halaman ganti
// password wajib: user yang belum mau mengganti password tetap bisa keluar.

"use client";

import { Button } from "@/components/ui/button";
import { useLogout } from "@/features/auth/hooks/use-logout";

export function LogoutButton() {
  const { isPending, logout } = useLogout();

  return (
    <Button type="button" variant="link" size="sm" disabled={isPending} onClick={logout}>
      {isPending ? "Keluar..." : "Keluar"}
    </Button>
  );
}
