// Navbar di bagian atas konten.
//
//   [≡] | Judul halaman                                  [menu user]
//
// - [≡] (SidebarTrigger): di desktop menciutkan sidebar, di HP membuka drawer.
// - `sticky top-0`: navbar tetap terlihat saat halaman di-scroll.
// - Menu user diterima lewat prop `userMenu` (slot) agar layout bisa
//   membungkusnya dengan <Suspense>.
// - PageTitle membaca URL (usePathname). Di halaman dengan segmen dinamis
//   seperti /users/[id], URL baru diketahui saat request, jadi PageTitle
//   wajib di dalam <Suspense>. Di halaman statis judulnya tetap ikut prerender.
//   Referensi: https://nextjs.org/docs/messages/blocking-prerender-client-hook

import { Suspense, type ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { PageTitle } from "./page-title";

export function AppHeader({ userMenu }: { userMenu: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-center" />
      <Suspense>
        <PageTitle />
      </Suspense>
      <div className="ml-auto flex items-center gap-2">{userMenu}</div>
    </header>
  );
}
