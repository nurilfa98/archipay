// Server Action log error (BUSINESS-FLOW §21).
//
// - logClientError: dipanggil browser (halaman error, error yang lolos, kamera
//   gagal). Boleh dari halaman sebelum login, jadi tidak mewajibkan sesi; user
//   diambil dari cookie bila ada. Semua isian dari browser tidak dipercaya:
//   divalidasi, dipotong, dan dibatasi jumlahnya per pengguna.
// - setErrorGroupStatus: Superadmin menandai satu kelompok error (fingerprint)
//   Selesai / Diabaikan / Baru. Tindakan Superadmin tidak masuk Audit Log.

"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentUser, requirePlatformAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { errorLogs } from "@/lib/db/schema";
import { logError } from "@/lib/error-log";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { ERROR_STATUSES } from "./constants";

const clientSchema = z.object({
  path: z.string().trim().max(500).optional(),
  digest: z.string().trim().max(100).optional(),
  name: z.string().trim().max(100).optional(),
  message: z.string().trim().min(1).max(1000),
  stack: z.string().max(8000).optional(),
  action: z.string().trim().max(150).optional(),
});

export type ClientErrorInput = z.input<typeof clientSchema>;

// Maksimal 15 laporan per pengguna (atau IP, bila belum login) per 10 menit.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 15;
const reports = new Map<string, number[]>();

function overLimit(key: string) {
  const now = Date.now();
  const recent = (reports.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    reports.set(key, recent);
    return true;
  }
  reports.set(key, [...recent, now]);
  if (reports.size > 1000) reports.clear();
  return false;
}

export async function logClientError(input: ClientErrorInput): Promise<void> {
  try {
    const parsed = clientSchema.safeParse(input);
    if (!parsed.success) return;
    const { path, digest, name, message, stack, action } = parsed.data;

    const user = await getCurrentUser().catch(() => null);
    if (overLimit(user?.id ?? (await getClientIp()) ?? "anon")) return;
    const roles = user?.roles.join(",") ?? null;

    // Error dari server (digest sama) sudah dicatat instrumentation.ts tanpa
    // identitas pengguna: lengkapi dengan siapa yang mengalaminya.
    if (digest && user) {
      const updated = await db
        .update(errorLogs)
        .set({ userId: user.id, companyId: user.company?.id ?? null, role: roles })
        .where(and(eq(errorLogs.digest, digest), isNull(errorLogs.userId)))
        .returning({ id: errorLogs.id });
      if (updated.length > 0) return;
    } else if (digest) {
      const [existing] = await db
        .select({ id: errorLogs.id })
        .from(errorLogs)
        .where(eq(errorLogs.digest, digest))
        .limit(1);
      if (existing) return;
    }

    const error = Object.assign(new Error(message), { name: name || "Error", stack: stack || undefined });
    await logError(error, {
      source: "CLIENT",
      action,
      path,
      digest,
      userId: user?.id ?? null,
      companyId: user?.company?.id ?? null,
      role: roles,
      userAgent: (await headers()).get("user-agent"),
    });
  } catch (failure) {
    console.error("[error-log] laporan browser gagal dicatat:", failure);
  }
}

const statusSchema = z.object({
  fingerprint: z.string().length(40),
  status: z.enum(ERROR_STATUSES),
  note: z.string().trim().max(500),
});

export async function setErrorGroupStatus(
  fingerprint: string,
  status: (typeof ERROR_STATUSES)[number],
  formData?: FormData,
): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const parsed = statusSchema.safeParse({ fingerprint, status, note: String(formData?.get("note") ?? "") });
  if (!parsed.success) return { success: false, message: "Data tidak valid." };

  const now = new Date();
  await db
    .update(errorLogs)
    .set(
      parsed.data.status === "NEW"
        ? { status: "NEW", resolvedAt: null, resolvedById: null }
        : { status: parsed.data.status, resolvedAt: now, resolvedById: actor.id, note: parsed.data.note || null },
    )
    .where(eq(errorLogs.fingerprint, parsed.data.fingerprint));

  revalidatePath("/error-logs");
  return { success: true, data: undefined };
}
