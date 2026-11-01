// Halaman error terakhir, bila root layout (app/layout.tsx) sendiri gagal.
// Menggantikan root layout, jadi wajib menulis <html> & <body> sendiri dan
// memuat globals.css. Tema gelap tidak ikut (ThemeProvider ada di root layout),
// dan metadata tidak didukung sehingga judul memakai <title>.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md (Global Error)

"use client";

import { ErrorView } from "@/components/status-page/error-view";
import { PRODUCT_NAME } from "@/lib/brand";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="id">
      <body className="antialiased">
        <title>{`Terjadi kesalahan | ${PRODUCT_NAME}`}</title>
        <ErrorView error={error} retry={retry} standalone />
      </body>
    </html>
  );
}
