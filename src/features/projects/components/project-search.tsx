// Kolom pencarian + daftar kartu project. Menyaring langsung di browser saat
// mengetik (tanpa Enter, tanpa menunggu server), sama seperti kotak menu.
// Kolom kosong = semua project tampil.
//
// Kartu project dirender di server (Server Component) lalu dikirim ke sini
// sebagai `entries[].card`, bersama teks yang dicari (nama + klien). Komponen
// ini hanya memilih kartu mana yang ditampilkan. Jumlah project sedikit
// (puluhan), jadi semua kartu boleh dikirim sekaligus.

"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ProjectSearchEntry = { key: string; searchText: string; card: ReactNode };

export function ProjectSearchList({ entries }: { entries: ProjectSearchEntry[] }) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const active = trimmed.length > 0;
  const keyword = trimmed.toLowerCase();
  const visible = active ? entries.filter((entry) => entry.searchText.toLowerCase().includes(keyword)) : entries;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex w-full max-w-md flex-col gap-1">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama project atau klien"
                aria-label="Cari project"
                className="pl-8"
              />
            </div>
            {query && (
              <Button variant="ghost" size="icon" onClick={() => setQuery("")} aria-label="Hapus pencarian">
                <XIcon />
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground sm:pt-2" aria-live="polite">
          {active ? `${visible.length} dari ${entries.length} project` : `${entries.length} project`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Project atau klien &quot;{trimmed}&quot; tidak ditemukan.
        </p>
      ) : (
        // 1 kolom di HP, 2 di tablet, 3 di layar lebar.
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((entry) => (
            <div key={entry.key} className="contents">
              {entry.card}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
