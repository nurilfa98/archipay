// Layout untuk SEMUA halaman setelah login (route group "(app)").
// Setiap page.tsx di dalam folder (app)/ otomatis memakai sidebar + navbar ini,
// sehingga page fitur cukup berisi UI khusus halamannya saja.
//
//   ┌──────────┬──────────────────────────────┐
//   │ Sidebar  │ Navbar (AppHeader)           │
//   │ (menu)   ├──────────────────────────────┤
//   │          │ {children} = page.tsx        │
//   └──────────┴──────────────────────────────┘
//
// Kenapa bagian user dibungkus <Suspense>?
// Dengan cacheComponents: true, komponen yang membaca cookie wajib berada di
// dalam <Suspense>. Hasilnya, kerangka (logo, navbar, konten) tampil instan
// dan hanya menu + avatar yang menyusul.
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
import { AppSidebar } from "@/components/layout/app-sidebar";
import { NavMain, NavMainSkeleton } from "@/components/layout/nav-main";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  UserMenu,
  UserMenuSkeleton,
} from "@/features/auth/components/user-menu";
import { verifySession } from "@/lib/auth/dal";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar
        nav={
          <Suspense fallback={<NavMainSkeleton />}>
            <SidebarNav />
          </Suspense>
        }
      />
      <SidebarInset>
        <AppHeader
          userMenu={
            <Suspense fallback={<UserMenuSkeleton />}>
              <HeaderUserMenu />
            </Suspense>
          }
        />
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Dua komponen di bawah sama-sama memanggil verifySession(), tapi query ke
// database hanya terjadi sekali per request berkat 'use cache: private' di DAL.
// Kalau session tidak valid (misal user dinonaktifkan), user diarahkan ke /login.

async function SidebarNav() {
  const user = await verifySession();
  return <NavMain roles={user.roles} />;
}

async function HeaderUserMenu() {
  const user = await verifySession();
  return (
    <UserMenu
      user={{ fullName: user.fullName, email: user.email, roles: user.roles }}
    />
  );
}
