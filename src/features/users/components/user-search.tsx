// Kolom pencarian pengguna: mencari otomatis saat mengetik (tanpa Enter),
// minimal 3 karakter.
//
// Kata kunci disimpan di URL (/users?q=budi) supaya hasil pencarian bisa
// di-bookmark dan tombol Back berfungsi. Server yang mencari ke database
// (halaman /users), komponen ini hanya mengganti URL-nya.
//
// - Debounce 300 ms: URL baru diganti setelah berhenti mengetik, agar tidak
//   ada request ke server di setiap huruf.
// - Kurang dari 3 karakter (atau kosong) = tampilkan semua pengguna.
// - <Form> dari next/form tetap dipakai, jadi Enter juga berfungsi (dan
//   pencarian tetap jalan walau JavaScript belum termuat).
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md

"use client";

import { SearchIcon, XIcon } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { USER_SEARCH_MIN_LENGTH } from "@/features/users/constants";

const DEBOUNCE_MS = 300;

// Kata kunci yang benar-benar dipakai untuk mencari (undefined = semua).
function toSearch(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= USER_SEARCH_MIN_LENGTH ? trimmed : undefined;
}

export function UserSearch({ search }: { search?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [tooShort, setTooShort] = useState(false);

  // Isi input mengikuti URL saat URL berubah dari luar (tombol Back atau
  // tombol hapus), tapi tidak menimpa ketikan yang sedang berjalan.
  useEffect(() => {
    const input = inputRef.current;
    if (input && toSearch(input.value) !== search) input.value = search ?? "";
  }, [search]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleChange(value: string) {
    const trimmed = value.trim();
    setTooShort(trimmed.length > 0 && trimmed.length < USER_SEARCH_MIN_LENGTH);

    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = toSearch(value);
      if (next === search) return;
      const url = next ? `/users?q=${encodeURIComponent(next)}` : "/users";
      startTransition(() => router.replace(url, { scroll: false }));
    }, DEBOUNCE_MS);
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-1">
      <Form action="/users" replace className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            name="q"
            type="search"
            defaultValue={search}
            onChange={(event) => handleChange(event.target.value)}
            placeholder="Cari nama atau email"
            aria-label="Cari pengguna"
            className="pl-8"
          />
        </div>
        {search && (
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={<Link href="/users" replace />}
            onClick={() => setTooShort(false)}
            aria-label="Hapus pencarian"
          >
            <XIcon />
          </Button>
        )}
      </Form>
      {tooShort && (
        <p className="text-xs text-muted-foreground">Ketik minimal {USER_SEARCH_MIN_LENGTH} karakter</p>
      )}
    </div>
  );
}
