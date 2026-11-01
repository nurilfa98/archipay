// Isi halaman "Terjadi kesalahan" yang dipakai bersama oleh app/error.tsx,
// app/(app)/error.tsx, dan app/global-error.tsx.
//
// - Coba lagi: retry() mengambil ulang data dan merender ulang bagian yang error.
// - Ke beranda: link biasa ke "/".
// - Hubungi admin platform: kirim laporan WhatsApp (khusus user login).
// Kode error (digest) ditampilkan kecil agar bisa disebutkan ke admin.

"use client";

import { HouseIcon, RotateCwIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorReportButton } from "@/features/error-reports/components/error-report-button";
import { ErrorIllustration } from "./status-illustrations";
import { StatusPage } from "./status-page";

export function ErrorView({
  error,
  retry,
  standalone = false,
}: {
  error: unknown;
  retry: () => void;
  standalone?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <StatusPage
      standalone={standalone}
      illustration={<ErrorIllustration />}
      label="Terjadi kesalahan"
      title="Terjadi kesalahan, coba lagi"
      description={
        <>
          <p>
            Halaman ini gagal dimuat. Biasanya hanya sementara: tekan <strong>Coba lagi</strong>. Bila masih
            terjadi, laporkan ke admin platform agar segera kami perbaiki.
          </p>
          {digest && <p className="mt-2 font-mono text-xs">Kode error: {digest}</p>}
        </>
      }
    >
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCwIcon />
          Coba lagi
        </Button>
        {/* Error boundary otomatis kembali normal saat halaman berpindah. */}
        <Button variant="outline" className="bg-card" nativeButton={false} render={<Link href="/" />}>
          <HouseIcon />
          Ke beranda
        </Button>
      </div>
      <ErrorReportButton error={error} />
    </StatusPage>
  );
}
