// Halaman 404 untuk notFound() di halaman setelah login (misal detail uang
// muka yang tidak ada). Header aplikasi tetap tampil.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md

import { NotFoundView } from "@/components/status-page/not-found-view";

export default function AppNotFound() {
  return <NotFoundView />;
}
