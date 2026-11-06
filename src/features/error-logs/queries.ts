// Query halaman Log Error Superadmin (/error-logs, BUSINESS-FLOW §21) dan
// penghapusan otomatis catatan lama.
//
// Daftar dikelompokkan per fingerprint: satu masalah = satu baris, dengan
// jumlah kejadian, kejadian pertama/terakhir, dan jumlah perusahaan terdampak.
// Status kelompok: NEW bila ada kejadian yang masih Baru, jika tidak RESOLVED
// bila ada yang Selesai, selain itu IGNORED. Kejadian baru setelah ditandai
// Selesai kembali berstatus Baru, jadi masalah yang muncul lagi terlihat.

import "server-only";
import { and, desc, eq, ilike, lt, or, sql, type AnyColumn } from "drizzle-orm";
import { io } from "next/cache";
import { db } from "@/lib/db";
import { companies, errorLogs, users } from "@/lib/db/schema";
import { ERROR_LOG_RETENTION_DAYS, type ErrorSource, type ErrorStatus } from "./constants";

export type ErrorGroup = {
  fingerprint: string;
  status: ErrorStatus;
  source: ErrorSource;
  errorName: string | null;
  message: string;
  actionName: string | null;
  path: string | null;
  count: number;
  companyCount: number;
  firstSeen: Date;
  lastSeen: Date;
  lastVersion: string | null;
};

export type ErrorGroupFilter = {
  status?: ErrorStatus;
  source?: ErrorSource;
  q?: string; // cari kode error (digest), pesan, atau nama aksi
};

const GROUP_LIMIT = 100;

// Nilai terbaru dalam satu kelompok.
const latest = <T>(column: AnyColumn) => sql<T>`(array_agg(${column} order by ${errorLogs.createdAt} desc))[1]`;

const groupStatus = sql<ErrorStatus>`case
  when bool_or(${errorLogs.status} = 'NEW') then 'NEW'
  when bool_or(${errorLogs.status} = 'RESOLVED') then 'RESOLVED'
  else 'IGNORED' end`;

const groupColumns = {
  fingerprint: errorLogs.fingerprint,
  status: groupStatus,
  source: latest<ErrorSource>(errorLogs.source),
  errorName: latest<string | null>(errorLogs.errorName),
  message: latest<string>(errorLogs.message),
  actionName: latest<string | null>(errorLogs.actionName),
  path: latest<string | null>(errorLogs.path),
  count: sql<number>`count(*)`.mapWith(Number),
  companyCount: sql<number>`count(distinct ${errorLogs.companyId})`.mapWith(Number),
  firstSeen: sql<string>`min(${errorLogs.createdAt})`,
  lastSeen: sql<string>`max(${errorLogs.createdAt})`,
  lastVersion: latest<string | null>(errorLogs.appVersion),
};

type GroupRow = Omit<ErrorGroup, "firstSeen" | "lastSeen"> & { firstSeen: string | Date; lastSeen: string | Date };

const toGroup = (row: GroupRow): ErrorGroup => ({
  ...row,
  firstSeen: new Date(row.firstSeen),
  lastSeen: new Date(row.lastSeen),
});

export async function listErrorGroups(filter: ErrorGroupFilter): Promise<ErrorGroup[]> {
  await io();
  const like = filter.q ? `%${filter.q.replace(/[\\%_]/g, "\\$&")}%` : null;
  const rows = await db
    .select(groupColumns)
    .from(errorLogs)
    .where(
      and(
        filter.source ? eq(errorLogs.source, filter.source) : undefined,
        like
          ? or(ilike(errorLogs.digest, like), ilike(errorLogs.message, like), ilike(errorLogs.actionName, like))
          : undefined,
      ),
    )
    .groupBy(errorLogs.fingerprint)
    .having(filter.status ? sql`${groupStatus} = ${filter.status}` : undefined)
    .orderBy(desc(sql`max(${errorLogs.createdAt})`))
    .limit(GROUP_LIMIT);
  return rows.map(toGroup);
}

// Jumlah masalah yang masih Baru (angka di tab Log Error).
export async function countNewErrorGroups(): Promise<number> {
  await io();
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${errorLogs.fingerprint})`.mapWith(Number) })
    .from(errorLogs)
    .where(eq(errorLogs.status, "NEW"));
  return row?.count ?? 0;
}

export type ErrorOccurrence = {
  id: string;
  createdAt: Date;
  digest: string | null;
  source: ErrorSource;
  stack: string | null;
  path: string | null;
  method: string | null;
  appVersion: string | null;
  userName: string | null;
  role: string | null;
  companyName: string | null;
  userAgent: string | null;
  context: Record<string, unknown> | null;
};

export type ErrorGroupDetail = ErrorGroup & {
  note: string | null;
  occurrences: ErrorOccurrence[];
};

const OCCURRENCE_LIMIT = 20;

export async function getErrorGroup(fingerprint: string): Promise<ErrorGroupDetail | null> {
  await io();
  const [[group], occurrences, [noted]] = await Promise.all([
    db
      .select(groupColumns)
      .from(errorLogs)
      .where(eq(errorLogs.fingerprint, fingerprint))
      .groupBy(errorLogs.fingerprint),
    db
      .select({
        id: errorLogs.id,
        createdAt: errorLogs.createdAt,
        digest: errorLogs.digest,
        source: errorLogs.source,
        stack: errorLogs.stack,
        path: errorLogs.path,
        method: errorLogs.method,
        appVersion: errorLogs.appVersion,
        userName: users.fullName,
        role: errorLogs.role,
        companyName: companies.name,
        userAgent: errorLogs.userAgent,
        context: errorLogs.context,
      })
      .from(errorLogs)
      .leftJoin(users, eq(errorLogs.userId, users.id))
      .leftJoin(companies, eq(errorLogs.companyId, companies.id))
      .where(eq(errorLogs.fingerprint, fingerprint))
      .orderBy(desc(errorLogs.createdAt))
      .limit(OCCURRENCE_LIMIT),
    db
      .select({ note: errorLogs.note })
      .from(errorLogs)
      .where(and(eq(errorLogs.fingerprint, fingerprint), sql`${errorLogs.note} is not null`))
      .orderBy(desc(errorLogs.resolvedAt))
      .limit(1),
  ]);
  if (!group) return null;

  return {
    ...toGroup(group),
    note: noted?.note ?? null,
    occurrences: occurrences.map((row) => ({
      ...row,
      source: row.source as ErrorSource,
      context: row.context && typeof row.context === "object" ? (row.context as Record<string, unknown>) : null,
    })),
  };
}

// Dipanggil cron harian: hapus catatan yang lewat masa simpan.
export async function purgeOldErrorLogs(now = new Date()) {
  const cutoff = new Date(now.getTime() - ERROR_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(errorLogs).where(lt(errorLogs.createdAt, cutoff)).returning({ id: errorLogs.id });
  return { deleted: deleted.length };
}
