// Halaman / (tepat setelah login): kotak menu ArchiPay dengan kolom pencarian.
// Menu yang tampil disaring sesuai role user (lihat nav-config.ts).
//
// Judul statis di luar <Suspense>; daftar menu butuh role user (cookie), jadi
// berada di dalamnya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { MenuLauncher, MenuLauncherSkeleton } from "@/components/layout/menu-launcher";
import { verifySession } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Menu",
};

export default function MenuPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-4 sm:py-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          <Suspense fallback="Selamat datang di ArchiPay">
            <Greeting />
          </Suspense>
        </h1>
        <p className="text-sm text-muted-foreground">Pilih menu untuk mulai bekerja.</p>
      </div>
      <Suspense fallback={<MenuLauncherSkeleton />}>
        <Menu />
      </Suspense>
    </div>
  );
}

async function Greeting() {
  const user = await verifySession();
  return `Halo, ${user.fullName.split(" ")[0]}`;
}

async function Menu() {
  const user = await verifySession();
  return <MenuLauncher roles={user.roles} />;
}
