// Kolom pencarian + chip saring status + daftar kartu company. Menyaring
// langsung di browser saat mengetik, sama seperti daftar project.
//
// Kartu dirender di server lalu dikirim ke sini sebagai `entries[].card`,
// bersama teks yang dicari (nama company, Owner, email Owner) dan statusnya.
// Komponen ini hanya memilih kartu mana yang ditampilkan. Chip saring diberi
// titik berwarna sesuai status (../status.ts), sekaligus menjadi keterangan
// arti warna kartu.

"use client";

import { AlarmClockIcon, SearchIcon, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { COMPANY_STATUS, COMPANY_STATUSES, type CompanyStatus } from "../status";

// SOON = "Segera habis" (masa aktif ≤ 7 hari), lintas status Masa gratis/Aktif.
export type CompanyFilter = "ALL" | "SOON" | CompanyStatus;

export type CompanySearchEntry = {
  key: string;
  searchText: string;
  status: CompanyStatus;
  soon: boolean;
  card: ReactNode;
};

const matches = (entry: CompanySearchEntry, filter: CompanyFilter) =>
  filter === "ALL" || (filter === "SOON" ? entry.soon : entry.status === filter);

export function CompanySearchList({ entries }: { entries: CompanySearchEntry[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CompanyFilter>("ALL");
  const keyword = query.trim().toLowerCase();

  const byStatus = entries.filter((entry) => matches(entry, filter));
  const visible = keyword ? byStatus.filter((entry) => entry.searchText.toLowerCase().includes(keyword)) : byStatus;
  const countOf = (value: CompanyFilter) => entries.filter((entry) => matches(entry, value)).length;
  // Segera habis, Tenggang & Terkunci hanya tampil bila ada company-nya.
  const filters: CompanyFilter[] = [
    "ALL",
    ...(countOf("SOON") > 0 ? (["SOON"] as const) : []),
    ...COMPANY_STATUSES.filter((status) => COMPANY_STATUS[status].alwaysInFilter || countOf(status) > 0),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full max-w-md gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama company atau Owner"
              aria-label="Cari company"
              className="pl-8"
            />
          </div>
          {query && (
            <Button variant="ghost" size="icon" onClick={() => setQuery("")} aria-label="Hapus pencarian">
              <XIcon />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring status company">
          {filters.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              title={filterTitle(value)}
              className="rounded-full"
            >
              {value === "SOON" && <AlarmClockIcon className="text-amber-600 dark:text-amber-400" />}
              {value !== "ALL" && value !== "SOON" && (
                <span className={cn("size-2 rounded-full", COMPANY_STATUS[value].dotClass)} />
              )}
              {filterLabel(value)}
              <span className="tabular-nums opacity-70">{countOf(value)}</span>
            </Button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {keyword ? `Company atau Owner "${query.trim()}" tidak ditemukan.` : "Tidak ada company dengan status ini."}
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

function filterLabel(value: CompanyFilter) {
  if (value === "ALL") return "Semua";
  if (value === "SOON") return "Segera habis";
  return COMPANY_STATUS[value].label;
}

function filterTitle(value: CompanyFilter) {
  if (value === "ALL") return undefined;
  if (value === "SOON") return "Masa gratis/langganan tinggal 7 hari atau kurang";
  return COMPANY_STATUS[value].description;
}
