// Pelapor error dari browser (BUSINESS-FLOW §21), dipanggil dari Client
// Component. Tidak pernah melempar error dan tidak menunggu hasilnya, supaya
// tidak mengganggu layar pengguna.

"use client";

import { logClientError } from "./actions";

export function reportClientError(error: unknown, options: { action?: string; digest?: string } = {}) {
  try {
    const digest =
      options.digest ??
      (typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
        ? error.digest
        : undefined);
    const isError = error instanceof Error;
    void logClientError({
      path: window.location.pathname,
      digest,
      name: isError ? error.name : undefined,
      message: (isError ? error.message : String(error)).slice(0, 1000) || "Error browser",
      stack: isError ? error.stack?.slice(0, 8000) : undefined,
      action: options.action,
    }).catch(() => {});
  } catch {
    // pelaporan tidak boleh menimbulkan error baru
  }
}
