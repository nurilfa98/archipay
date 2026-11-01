// Halaman error untuk semua halaman setelah login. Header aplikasi tetap
// tampil karena error boundary ini berada DI DALAM app/(app)/layout.tsx.
// Error di layout-nya sendiri ditangani app/error.tsx.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md

"use client";

import { ErrorView } from "@/components/status-page/error-view";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
