// Kotak menu di halaman / (tepat setelah login): kolom pencarian, lalu ikon
// menu yang boleh dibuka user.
//
// Client Component karena pencarian disaring langsung di browser saat
// mengetik. Komponen ini menerima `roles` dari server, bukan daftar menu,
// karena ikon lucide adalah fungsi yang tidak bisa dikirim dari Server
// Component ke Client Component.
//
// Enter di kolom pencarian membuka menu pertama yang cocok.

"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";
import { MENU_ITEMS, type MenuItem } from "./nav-config";

function matches(item: MenuItem, query: string) {
  const text = [item.title, item.description, ...(item.keywords ?? [])].join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

export function MenuLauncher({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const allowed = MENU_ITEMS.filter((item) => !item.permission || can({ roles }, item.permission));
  const visible = allowed.filter((item) => matches(item, query));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visible[0]) router.push(visible[0].href);
  }

  return (
    <div className="flex flex-col gap-6">
      <form role="search" onSubmit={handleSubmit} className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Cari menu"
          placeholder="Cari menu, misalnya: pengguna, potong gaji"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 pl-9 text-base md:text-sm"
        />
      </form>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Menu &quot;{query}&quot; tidak ditemukan.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex h-full flex-col items-center gap-3 rounded-xl border bg-card p-4 text-center outline-none transition-colors hover:border-brand/40 hover:bg-brand/5 focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                  <item.icon className="size-6" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MenuLauncherSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-11 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
