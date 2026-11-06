// Dijalankan Next.js saat server mulai. Dipakai untuk satu hal: mencatat setiap
// error server yang TIDAK tertangani (halaman gagal dirender, route atau Server
// Action melempar error) ke tabel error_logs (lib/error-log.ts, BUSINESS-FLOW §21).
//
// Error yang sudah ditangkap blok catch dicatat langsung oleh pemanggilnya
// (logError). Redirect, 404, dan sinyal internal Next.js bukan error: dilewati.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md

import type { Instrumentation } from "next";

const INTERNAL_DIGEST = /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // Database (postgres.js) hanya ada di runtime Node.js.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if ((digest && INTERNAL_DIGEST.test(digest)) || /NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(message)) return;

  const { logError } = await import("@/lib/error-log");
  const path = request.path.split("?")[0];
  const userAgent = request.headers["user-agent"];
  await logError(error, {
    source:
      context.routeType === "action"
        ? "SERVER_ACTION"
        : context.routeType === "render"
          ? "PAGE"
          : path.startsWith("/api/cron/")
            ? "CRON"
            : "ROUTE",
    action: context.routePath,
    path,
    method: request.method,
    digest,
    resolveUser: false,
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  });
};
