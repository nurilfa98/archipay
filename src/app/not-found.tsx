// Halaman 404 untuk URL yang tidak dikenal (dan notFound() di luar halaman
// setelah login). Tampil penuh dengan logo karena berada di luar layout aplikasi.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md

import type { Metadata } from "next";
import { NotFoundView } from "@/components/status-page/not-found-view";

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan",
};

export default function NotFound() {
  return <NotFoundView standalone />;
}
