// Tombol mengambang di pojok kanan bawah: kembali ke kotak menu (/), sama
// seperti klik logo ArchiPay di header. Tidak tampil di halaman menu itu sendiri.
//
// Client Component karena butuh usePathname(). Di halaman dengan segmen
// dinamis, URL baru diketahui saat request, jadi layout membungkusnya dengan
// <Suspense> (sama seperti PageBreadcrumb).

"use client";

import { LayoutGridIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MenuFab() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <Button
      variant="brand"
      size="icon-lg"
      nativeButton={false}
      render={<Link href="/" />}
      aria-label="Kembali ke menu"
      title="Kembali ke menu"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 size-12 rounded-full shadow-lg sm:right-6 sm:bottom-6"
    >
      <LayoutGridIcon className="size-5" />
    </Button>
  );
}
