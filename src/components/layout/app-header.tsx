// Header di bagian atas setiap halaman setelah login. Isinya dibatasi
// container yang sama dengan konten, sehingga sejajar di tengah layar.
//
//   [logo] | Menu > Project > Uang Muka               [tema] [menu user]
//
// - Logo kembali ke kotak menu di /.
// - `sticky top-0`: header tetap terlihat saat halaman di-scroll.
// - [tema] (ThemeToggle): pilihan Terang / Gelap / Sistem.
// - Menu user diterima lewat prop `userMenu` (slot) agar layout bisa
//   membungkusnya dengan <Suspense>.
// - PageBreadcrumb membaca URL (usePathname). Di halaman dengan segmen dinamis
//   seperti /users/[id], URL baru diketahui saat request, jadi breadcrumb
//   wajib di dalam <Suspense>. Di halaman statis breadcrumb tetap ikut prerender.
//   Referensi: https://nextjs.org/docs/messages/blocking-prerender-client-hook

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { Brand } from "./brand";
import { PageBreadcrumb } from "./page-breadcrumb";

export function AppHeader({ userMenu }: { userMenu: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <Link href="/" aria-label="Kembali ke menu" className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Brand compact />
        </Link>
        <Separator orientation="vertical" className="data-vertical:h-4 data-vertical:self-center" />
        <Suspense>
          <PageBreadcrumb />
        </Suspense>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ThemeToggle />
          {userMenu}
        </div>
      </div>
    </header>
  );
}
