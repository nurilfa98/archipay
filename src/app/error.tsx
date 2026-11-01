// Halaman error tingkat atas: error di halaman login/ganti password, atau di
// layout route group (misal header aplikasi). Tampil penuh dengan logo karena
// header aplikasi tidak ikut tampil. Error di root layout → app/global-error.tsx.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md

"use client";

import { ErrorView } from "@/components/status-page/error-view";

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} standalone />;
}
