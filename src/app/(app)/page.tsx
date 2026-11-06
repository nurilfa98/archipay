// Halaman / (tepat setelah login): kotak menu ArchiPay dengan kolom pencarian.
// Menu yang tampil disaring sesuai role user (lihat nav-config.ts).
// Superadmin yang belum membuka company diarahkan ke daftar company; Owner
// company yang terkunci (langganan habis) diarahkan ke Langganan.
//
// Kartu sapaan ("Selamat pagi, Nuril" + hari, tanggal, jam digital) dan daftar
// menu butuh data user (cookie), jadi berada di dalam <Suspense>.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MenuLauncher, MenuLauncherSkeleton } from "@/components/layout/menu-launcher";
import { WelcomeCard, WelcomeCardSkeleton } from "@/components/layout/welcome-card";
import { verifyAccount } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Menu",
};

export default function MenuPage() {
  return (
    // -mt-3: <main> sudah punya pt-6; dikurangi agar kartu sapaan lebih dekat ke navbar.
    <div className="mx-auto -mt-3 flex w-full max-w-3xl flex-col gap-3 pb-4 sm:pb-8">
      <Suspense fallback={<WelcomeCardSkeleton />}>
        <Welcome />
      </Suspense>
      <Suspense fallback={<MenuLauncherSkeleton />}>
        <Menu />
      </Suspense>
    </div>
  );
}

// Jam memakai zona waktu perusahaan (APP_TIMEZONE), bukan zona waktu perangkat.
async function Welcome() {
  const user = await verifyAccount();
  return <WelcomeCard name={user.fullName.split(" ")[0]} timeZone={env.APP_TIMEZONE} />;
}

async function Menu() {
  const user = await verifyAccount();
  if (!user.company) redirect("/companies");
  if (user.company.access.locked && !can(user, "company:manage")) redirect("/subscription");
  const { attendance, payroll } = user.company;
  return <MenuLauncher roles={user.roles} addons={{ attendance, payroll }} />;
}
