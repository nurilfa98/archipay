// Kolom pencarian pengguna.
//
// <Form> dari next/form dengan action berupa string bekerja seperti form GET
// biasa: isian dikirim sebagai query string (/users?q=budi), tapi pindah
// halamannya lewat navigasi client-side (tanpa reload penuh). Karena kata
// kunci ada di URL, hasil pencarian bisa di-bookmark dan tombol Back berfungsi.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md

import { SearchIcon, XIcon } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UserSearch({ search }: { search?: string }) {
  return (
    <Form action="/users" replace className="flex w-full max-w-sm gap-2">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          // key: isi input ikut berubah saat URL berubah (misal setelah tombol Back)
          key={search}
          name="q"
          type="search"
          defaultValue={search}
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
          aria-label="Hapus pencarian"
        >
          <XIcon />
        </Button>
      )}
    </Form>
  );
}
