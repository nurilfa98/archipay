// Pencatat error ke tabel error_logs (BUSINESS-FLOW §21), dipakai:
// - instrumentation.ts → onRequestError: error halaman, route, dan Server Action
//   yang tidak tertangani
// - blok catch di Server Action, cron, dan pemanggil layanan luar (R2, Fonnte,
//   Resend), menggantikan console.error
// - features/error-logs/actions.ts: error dari browser
//
// Aturan penting:
// 1. Pencatatan TIDAK PERNAH melempar error. Bila database sendiri bermasalah,
//    cukup console.error (log server tetap berisi).
// 2. Data dibersihkan sebelum disimpan: pesan/stack yang memuat token, password,
//    atau sejenisnya diganti [disembunyikan]; `context` hanya menerima nilai
//    sederhana dan membuang kunci sensitif. Isi form tidak pernah disimpan.
// 3. Kejadian sama (fingerprint sama) dibatasi MAX_PER_MINUTE per menit per
//    instance server, agar satu masalah tidak membanjiri tabel.
// 4. Fingerprint yang sudah diabaikan Superadmin tetap dicatat tetapi berstatus
//    IGNORED, jadi tidak muncul lagi sebagai masalah baru.

import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { ErrorSource } from "@/features/error-logs/constants";
import { db } from "@/lib/db";
import { errorLogs } from "@/lib/db/schema";

const MAX_MESSAGE = 1000;
const MAX_STACK = 8000;
const MAX_PER_MINUTE = 5;
const MAX_CONTEXT_BYTES = 2000;

export type ErrorLogInput = {
  source: ErrorSource;
  // Nama fungsi/route/cron yang gagal, misal "recordBalancePayment".
  action?: string;
  path?: string;
  method?: string;
  digest?: string;
  // Identitas pengguna. Bila `userId` tidak diisi (undefined), diambil dari
  // sesi login saat ini; isi null untuk menyatakan "tanpa pengguna".
  userId?: string | null;
  companyId?: string | null;
  role?: string | null;
  resolveUser?: boolean; // false = jangan membaca sesi (instrumentation.ts)
  userAgent?: string | null;
  // Info tambahan yang aman (id data, status HTTP, kode database).
  context?: Record<string, unknown>;
};

// --- pembersihan -----------------------------------------------------------

const SECRET_PATTERNS: [RegExp, string][] = [
  [/(authorization|bearer)\s*[:=]?\s*[\w.~+/=-]{8,}/gi, "$1 [disembunyikan]"],
  [
    /(password|passwd|pwd|secret|token|api[_-]?key|apikey|cookie|session)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
    "$1$2[disembunyikan]",
  ],
  [/postgres(ql)?:\/\/[^\s"']+/gi, "postgres://[disembunyikan]"],
];
const SENSITIVE_KEY = /pass|token|secret|key|authorization|cookie|session|embedding|rekening|account|nik|phone|email/i;

export function scrubText(value: string) {
  return SECRET_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function scrubContext(context: Record<string, unknown> | undefined) {
  if (!context) return null;
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") clean[key] = value;
    else if (typeof value === "string") clean[key] = scrubText(value).slice(0, 300);
  }
  const json = JSON.stringify(clean);
  return json.length > MAX_CONTEXT_BYTES || json === "{}" ? null : clean;
}

// Path tanpa query string (bisa memuat token) dan dipotong.
export function cleanPath(path: string | undefined) {
  return path ? path.split(/[?#]/)[0].slice(0, 500) : null;
}

// --- pengelompokan ---------------------------------------------------------

function digestOf(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
    ? error.digest
    : null;
}

function describe(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message || error.name,
      stack: error.stack ?? null,
      digest: digestOf(error),
    };
  }
  if (typeof error === "string") return { name: "Error", message: error, stack: null, digest: null };
  let message = "Error tidak dikenal";
  try {
    message = JSON.stringify(error)?.slice(0, MAX_MESSAGE) ?? message;
  } catch {
    // objek melingkar: pakai pesan bawaan
  }
  return { name: "Error", message, stack: null, digest: digestOf(error) };
}

// Angka, UUID, dan hex panjang diseragamkan agar "nota 123 gagal" dan
// "nota 456 gagal" jatuh ke satu kelompok.
function normalize(message: string) {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "?")
    .replace(/\b[0-9a-f]{16,}\b/gi, "?")
    .replace(/\d+/g, "?");
}

// Baris stack pertama setelah pesan, tanpa nomor baris (berubah tiap deploy).
function firstFrame(stack: string | null) {
  const line = stack?.split("\n").find((item) => item.trimStart().startsWith("at "));
  return line ? line.trim().replace(/:\d+:\d+\)?$/, "") : "";
}

export function fingerprintOf(name: string, message: string, stack: string | null, action?: string) {
  return createHash("sha1")
    .update([name, normalize(message), firstFrame(stack), action ?? ""].join("|"))
    .digest("hex")
    .slice(0, 40);
}

// --- pembatas banjir --------------------------------------------------------

const windows = new Map<string, { start: number; count: number }>();

function throttled(fingerprint: string) {
  const now = Date.now();
  const entry = windows.get(fingerprint);
  if (!entry || now - entry.start > 60_000) {
    if (windows.size > 500) windows.clear();
    windows.set(fingerprint, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_MINUTE;
}

// --- pencatatan -------------------------------------------------------------

export async function logError(error: unknown, input: ErrorLogInput): Promise<void> {
  // Log server (Vercel) tetap berisi, juga bila database gagal.
  console.error(`[${input.source}${input.action ? `:${input.action}` : ""}]`, error);
  try {
    const info = describe(error);
    const message = scrubText(info.message).slice(0, MAX_MESSAGE);
    const stack = info.stack ? scrubText(info.stack).slice(0, MAX_STACK) : null;
    const fingerprint = fingerprintOf(info.name, info.message, info.stack, input.action);
    if (throttled(fingerprint)) return;

    let { userId, companyId, role } = input;
    if (userId === undefined && input.resolveUser !== false && input.source !== "CRON") {
      try {
        const { getCurrentUser } = await import("@/lib/auth/dal"); // dinamis: hindari impor melingkar
        const user = await getCurrentUser();
        if (user) {
          userId = user.id;
          companyId ??= user.company?.id ?? null;
          role ??= user.roles.join(",");
        }
      } catch {
        // di luar request (cron, after): tanpa identitas pengguna
      }
    }

    // Sudah diabaikan Superadmin → tetap dicatat, tetapi tidak sebagai "baru".
    const [ignored] = await db
      .select({ id: errorLogs.id })
      .from(errorLogs)
      .where(and(eq(errorLogs.fingerprint, fingerprint), eq(errorLogs.status, "IGNORED")))
      .limit(1);

    await db.insert(errorLogs).values({
      digest: (input.digest ?? info.digest)?.slice(0, 100) ?? null,
      fingerprint,
      source: input.source,
      errorName: info.name.slice(0, 100),
      message,
      stack,
      actionName: input.action?.slice(0, 150) ?? null,
      path: cleanPath(input.path),
      method: input.method?.slice(0, 10) ?? null,
      appVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      companyId: companyId ?? null,
      userId: userId ?? null,
      role: role?.slice(0, 100) ?? null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 200) : null,
      context: scrubContext(input.context),
      status: ignored ? "IGNORED" : "NEW",
    });
  } catch (failure) {
    console.error("[error-log] gagal mencatat error:", failure);
  }
}
