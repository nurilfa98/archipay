// Query halaman Audit Log (khusus OWNER).
//
// Setiap baris audit_logs menunjuk data yang terdampak lewat
// entity_name + entity_id. Query ini menyambungkannya ke tabel aslinya agar
// halaman bisa menampilkan "UM-2026-10-0001" atau "Budi", bukan UUID.
// Laporan yang belum pernah dikirim belum bernomor PJ: tampil sebagai
// "Draf UM-2026-10-0001".

import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import { db } from "@/lib/db";
import { advanceRequests, auditLogs, expenseCategories, settlements, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { AUDIT_PAGE_LIMIT, auditActionsOf } from "./constants";
import type { AuditFilters } from "./schemas";

const tz = env.APP_TIMEZONE;
const actor = alias(users, "actor");
const targetUser = alias(users, "target_user");
const settlementAdvance = alias(advanceRequests, "settlement_advance");

export type AuditLogRow = {
  id: string;
  action: string;
  createdAt: Date;
  ipAddress: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  entityName: string;
  entityId: string;
  entityLabel: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
};

// Awal tahun/bulan menurut zona waktu perusahaan, sebagai timestamptz.
function zonedStart(year: number, month: number, offset: SQL) {
  return sql`((make_timestamp(${year}, ${month}, 1, 0, 0, 0) + ${offset}) at time zone ${tz})`;
}

export async function listAuditLogs(filter: AuditFilters): Promise<AuditLogRow[]> {
  await io();
  const period = filter.year
    ? filter.month
      ? and(
          gte(auditLogs.createdAt, zonedStart(filter.year, filter.month, sql`interval '0'`)),
          lt(auditLogs.createdAt, zonedStart(filter.year, filter.month, sql`interval '1 month'`)),
        )
      : and(
          gte(auditLogs.createdAt, zonedStart(filter.year, 1, sql`interval '0'`)),
          lt(auditLogs.createdAt, zonedStart(filter.year, 1, sql`interval '1 year'`)),
        )
    : undefined;

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
      ipAddress: auditLogs.ipAddress,
      actorId: auditLogs.userId,
      actorName: actor.fullName,
      actorEmail: actor.email,
      entityName: auditLogs.entityName,
      entityId: auditLogs.entityId,
      entityLabel: sql<string | null>`coalesce(
        ${advanceRequests.number},
        ${settlements.number},
        'Draf ' || ${settlementAdvance.number},
        ${targetUser.fullName},
        ${expenseCategories.name}
      )`,
      oldValues: auditLogs.oldValues,
      newValues: auditLogs.newValues,
    })
    .from(auditLogs)
    .leftJoin(actor, eq(auditLogs.userId, actor.id))
    .leftJoin(
      advanceRequests,
      and(eq(auditLogs.entityName, "advance_requests"), eq(advanceRequests.id, auditLogs.entityId)),
    )
    .leftJoin(settlements, and(eq(auditLogs.entityName, "settlements"), eq(settlements.id, auditLogs.entityId)))
    .leftJoin(settlementAdvance, eq(settlements.advanceId, settlementAdvance.id))
    .leftJoin(targetUser, and(eq(auditLogs.entityName, "users"), eq(targetUser.id, auditLogs.entityId)))
    .leftJoin(
      expenseCategories,
      and(eq(auditLogs.entityName, "expense_categories"), eq(expenseCategories.id, auditLogs.entityId)),
    )
    .where(
      and(
        period,
        filter.category ? inArray(auditLogs.action, auditActionsOf(filter.category)) : undefined,
        filter.actorId ? eq(auditLogs.userId, filter.actorId) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(AUDIT_PAGE_LIMIT);

  return rows.map((row) => ({
    ...row,
    oldValues: asRecord(row.oldValues),
    newValues: asRecord(row.newValues),
  }));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// Rentang tahun yang punya catatan, untuk pilihan filter. Memakai min/max
// (dibantu index created_at) agar tidak memindai seluruh tabel.
export async function listAuditYears(): Promise<number[]> {
  await io();
  const [row] = await db
    .select({
      first: sql<number | null>`extract(year from min(${auditLogs.createdAt}) at time zone ${tz})::int`,
      last: sql<number | null>`extract(year from max(${auditLogs.createdAt}) at time zone ${tz})::int`,
    })
    .from(auditLogs);
  if (!row?.first || !row.last) return [];
  return Array.from({ length: row.last - row.first + 1 }, (_, index) => row.last! - index);
}

// Semua pengguna (termasuk nonaktif) untuk filter "Pelaku".
export async function listAuditActors(): Promise<{ id: string; fullName: string }[]> {
  await io();
  return db.select({ id: users.id, fullName: users.fullName }).from(users).orderBy(asc(users.fullName));
}
