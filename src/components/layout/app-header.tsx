// Navbar di bagian atas konten.
//
//   [≡] | Keuangan > Uang Muka                  [tema] [menu user]
//
// - [≡] (SidebarTrigger): di desktop menciutkan sidebar, di HP membuka drawer.
// - `sticky top-0`: navbar tetap terlihat saat halaman di-scroll.
// - [tema] (ThemeToggle): pilihan Terang / Gelap / Sistem.
// - Menu user diterima lewat prop `userMenu` (slot) agar layout bisa
//   membungkusnya dengan <Suspense>.
// - PageBreadcrumb membaca URL (usePathname). Di halaman dengan segmen dinamis
//   seperti /users/[id], URL baru diketahui saat request, jadi breadcrumb
//   wajib di dalam <Suspense>. Di halaman statis breadcrumb tetap ikut prerender.
//   Referensi: https://nextjs.org/docs/messages/blocking-prerender-client-hook

import { Suspense, type ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { PageBreadcrumb } from "./page-breadcrumb";

export function AppHeader({ userMenu }: { userMenu: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-center" />
      <Suspense>
        <PageBreadcrumb />
      </Suspense>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        {userMenu}
      </div>
    </header>
  );
}
