// Menangkap error browser yang lolos dari React (script gagal, promise ditolak
// tanpa catch) dan mengirimnya ke log error (BUSINESS-FLOW §21). Dipasang di
// root layout, jadi aktif di semua halaman termasuk login. Error di dalam
// komponen React sudah ditangani halaman error (components/status-page).
//
// Dibatasi MAX_PER_PAGE laporan per pemuatan halaman, dan "noise" yang tidak
// bisa ditindaklanjuti (ResizeObserver, "Script error." dari ekstensi browser)
// dilewati.

"use client";

import { useEffect } from "react";
import { reportClientError } from "../report";

const MAX_PER_PAGE = 3;
const NOISE =
  /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|AbortError|Load failed|Failed to fetch/i;

export function ClientErrorListener() {
  useEffect(() => {
    let sent = 0;
    const report = (error: unknown, fallback: string) => {
      const message = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
      if (sent >= MAX_PER_PAGE || NOISE.test(message)) return;
      sent += 1;
      reportClientError(error, { action: "window" });
    };
    const onError = (event: ErrorEvent) => report(event.error ?? event.message, event.message || "Error browser");
    const onRejection = (event: PromiseRejectionEvent) => report(event.reason, "Promise ditolak tanpa alasan");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
