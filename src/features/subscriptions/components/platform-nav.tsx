// Tab di halaman platform Superadmin: Company · Tagihan · Pengaturan
// platform. Pengganti kotak menu, karena halaman platform tidak berada di
// bawah company mana pun. `claimed` = jumlah tagihan menunggu verifikasi.
//
// Client Component karena butuh usePathname().

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { matchesPath, PLATFORM_PAGES } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

export function PlatformNav({ claimed }: { claimed: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu platform" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b">
        {PLATFORM_PAGES.map((page) => {
          const active = matchesPath(pathname, page.href);
          return (
            <li key={page.href}>
              <Link
                href={page.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {page.title}
                {page.href === "/billing" && claimed > 0 && (
                  <span className="rounded-full bg-brand px-1.5 text-[11px] text-brand-foreground tabular-nums">
                    {claimed}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
