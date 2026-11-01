// Tombol "Hubungi admin platform" di halaman error.
//
// - Saat tampil, server ditanya dulu (getErrorReportStatus): tombol hanya
//   muncul untuk user yang login, dan bila dalam 30 menit terakhir sudah
//   melapor yang tampil keterangan, bukan tombol.
// - Setelah diklik, tombol langsung hilang (tidak bisa diklik berulang) dan
//   diganti keterangan hasilnya. Bila gagal terkirim, tombol muncul lagi
//   karena laporannya memang belum sampai.
// - Hasil tampil sebagai teks di tempat (bukan toast), karena halaman
//   global-error tidak memuat <Toaster>.

"use client";

import { CheckCircle2Icon, LoaderCircleIcon, MessageCircleWarningIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getErrorReportStatus, reportError } from "@/features/error-reports/actions";

type State =
  | { kind: "checking" }
  | { kind: "hidden" }
  | { kind: "ready"; message?: string } // message: alasan gagal sebelumnya
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "already" };

export function ErrorReportButton({ error }: { error: unknown }) {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let active = true;
    getErrorReportStatus()
      .then((status) => {
        if (!active) return;
        if (!status.canReport) setState({ kind: "hidden" });
        else setState(status.alreadyReported ? { kind: "already" } : { kind: "ready" });
      })
      // Server tidak bisa dihubungi: tombol tidak ditampilkan.
      .catch(() => active && setState({ kind: "hidden" }));
    return () => {
      active = false;
    };
  }, []);

  async function handleReport() {
    setState({ kind: "sending" });
    try {
      const result = await reportError({
        path: `${window.location.pathname}${window.location.search}`,
        digest: errorDigest(error),
        message: error instanceof Error ? error.message : String(error),
      });
      setState(result.success ? { kind: "sent" } : { kind: "ready", message: result.message });
    } catch {
      setState({ kind: "ready", message: "Laporan gagal dikirim. Periksa koneksi internet Anda, lalu coba lagi." });
    }
  }

  switch (state.kind) {
    case "checking":
    case "hidden":
      return null;
    case "sent":
    case "already":
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2Icon className="size-4 shrink-0" />
          {state.kind === "sent"
            ? "Laporan terkirim ke admin platform. Terima kasih, kami segera menindaklanjuti."
            : "Laporan Anda sudah diterima admin platform dan sedang ditindaklanjuti."}
        </p>
      );
    default:
      return (
        <div className="flex flex-col items-center gap-2">
          <Button variant="outline" className="bg-card" disabled={state.kind === "sending"} onClick={handleReport}>
            {state.kind === "sending" ? <LoaderCircleIcon className="animate-spin" /> : <MessageCircleWarningIcon />}
            {state.kind === "sending" ? "Mengirim laporan..." : "Hubungi admin platform"}
          </Button>
          {state.kind === "ready" && state.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
        </div>
      );
  }
}

// Kode error dari Server Component ("digest"), sama dengan yang tercatat di log server.
function errorDigest(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  return typeof error.digest === "string" ? error.digest : undefined;
}
