// Layout untuk SEMUA halaman setelah login (route group "(app)").
// Setiap page.tsx di dalam folder (app)/ otomatis memakai header ini, sehingga
// page fitur cukup berisi UI khusus halamannya saja.
//
//   ┌──────────────────────────────────────────────┐
//   │      Header (logo, breadcrumb, user)         │
//   ├──────────────────────────────────────────────┤
//   │      ┌──────────────────────────────┐        │
//   │      │ {children} = page.tsx        │        │
//   │      └──────────────────────────────┘        │
//   └──────────────────────────────────────────────┘
//
// Tidak ada sidebar: menu tampil sebagai kotak ikon di halaman /. Konten
// dibatasi container (max-w-6xl) agar berada di tengah layar lebar.
//
// Kenapa bagian user dibungkus <Suspense>?
// Dengan cacheComponents: true, komponen yang membaca cookie wajib berada di
// dalam <Suspense>. Hasilnya, kerangka (logo, header, konten) tampil instan
// dan hanya avatar yang menyusul.
//
// Catatan keamanan: layout TIDAK dirender ulang saat pindah halaman, jadi
// pengecekan di layout tidak cukup untuk melindungi data. Setiap page/action
// yang mengambil atau mengubah data tetap wajib memanggil verifySession()
// atau requirePermission().
//
// Referensi:
// - node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md (Route groups)
// - node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md (Step 2)
// - node_modules/next/dist/docs/01-app/02-guides/authentication.md (bagian "Layouts and auth checks")

import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { MenuFab } from "@/components/layout/menu-fab";
import { ActiveCompanyBar } from "@/features/companies/components/active-company-bar";
import { SubscriptionBanner } from "@/features/subscriptions/components/subscription-banner";
import { UserMenu, UserMenuSkeleton } from "@/features/auth/components/user-menu";
import { verifyAccount } from "@/lib/auth/dal";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        userMenu={
          <Suspense fallback={<UserMenuSkeleton />}>
            <HeaderUserMenu />
          </Suspense>
        }
      />
      <Suspense>
        <HeaderCompanyBar />
      </Suspense>
      {/* pb-24: ruang di bawah konten agar tidak tertutup tombol menu mengambang. */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pt-6 pb-24">{children}</main>
      <Suspense>
        <MenuFab />
      </Suspense>
    </div>
  );
}

// Kalau session tidak valid (misal user dinonaktifkan), user diarahkan ke /login.
async function HeaderUserMenu() {
  const user = await verifyAccount();
  return <UserMenu user={{ fullName: user.fullName, email: user.email, roles: user.roles }} />;
}

// Pita "Melihat company ..." khusus Superadmin yang sedang membuka company,
// dan spanduk masa aktif langganan khusus Owner.
async function HeaderCompanyBar() {
  const user = await verifyAccount();
  return (
    <>
      <ActiveCompanyBar user={user} />
      <SubscriptionBanner user={user} />
    </>
  );
}
