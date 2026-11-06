// Pencarian + dropdown sumber di halaman Log Error. Dropdown memakai komponen
// Select shadcn (sama dengan filter di halaman lain). Keduanya langsung
// diterapkan ke URL tanpa tombol: dropdown saat dipilih, pencarian 400 ms
// setelah berhenti mengetik (minimal 3 karakter, sama dengan tabel lain; kotak
// dikosongkan = pencarian dihapus). Nilai tetap di URL (?source=CRON&q=...)
// sehingga ikut tersimpan saat halaman di-refresh.

"use client";

import { LoaderCircleIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FILTER_ALL, useUrlFilters } from "@/components/data-table/data-table-filters";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ERROR_SOURCE_LABELS, ERROR_SOURCES } from "../constants";

const SOURCE_OPTIONS = [
  { value: FILTER_ALL, label: "Semua sumber" },
  ...ERROR_SOURCES.map((value) => ({ value, label: ERROR_SOURCE_LABELS[value] })),
];

const SEARCH_MIN_LENGTH = 3;
const SEARCH_DELAY_MS = 400;

export function ErrorLogFilters({ q, source }: { q: string; source: string }) {
  const { setFilters, pending } = useUrlFilters();
  const [text, setText] = useState(q);
  // Pencarian yang sedang berlaku di URL, agar tidak mengirim ulang nilai yang sama.
  const applied = useRef(q);

  useEffect(() => {
    const value = text.trim();
    // Terlalu pendek (tapi tidak kosong) = tunggu sampai cukup panjang.
    if (value === applied.current || (value.length > 0 && value.length < SEARCH_MIN_LENGTH)) return;
    const timer = setTimeout(() => {
      applied.current = value;
      setFilters({ q: value || undefined });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, setFilters]);

  // Enter = terapkan sekarang, tanpa menunggu jeda.
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (value.length > 0 && value.length < SEARCH_MIN_LENGTH) return;
    applied.current = value;
    setFilters({ q: value || undefined });
  }

  const tooShort = text.trim().length > 0 && text.trim().length < SEARCH_MIN_LENGTH;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Kode error, pesan, atau aksi"
          aria-label="Cari error"
          className="bg-card pl-8"
        />
      </div>
      <Select
        value={source || FILTER_ALL}
        onValueChange={(next) => next && setFilters({ source: String(next) })}
        items={SOURCE_OPTIONS}
      >
        <SelectTrigger aria-label="Sumber error" className="w-full bg-card sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SOURCE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {tooShort && <p className="text-xs text-muted-foreground">Ketik minimal {SEARCH_MIN_LENGTH} karakter</p>}
      {pending && <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-label="Memuat" />}
    </form>
  );
}
