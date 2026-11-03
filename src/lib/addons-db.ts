// Query add-on langganan (BUSINESS-FLOW §17.6). Aturannya dijelaskan di
// lib/addons.ts; addonActiveSql() di bawah adalah versi SQL dari
// addonCoverage() di sana. Ubah keduanya bersamaan.

import "server-only";
import { and, asc, eq, exists, gt, inArray, lte, sql } from "drizzle-orm";
import { addonCoverage, ADDON_KEYS, type AddonCoverage, type AddonKey } from "@/lib/addons";
import type { db } from "@/lib/db";
import { companies, subscriptions } from "@/lib/db/schema";

type Executor = Pick<typeof db, "select">;

// Ekspresi boolean "add-on aktif sekarang" untuk query yang memuat tabel
// companies (subquery berkorelasi ke companies.id).
export function addonActiveSql(executor: Executor, key: AddonKey) {
  const planStarted = exists(
    executor
      .select({ one: sql`1` })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.companyId, companies.id),
          eq(subscriptions.status, "ACTIVE"),
          eq(subscriptions.kind, "PLAN"),
          lte(subscriptions.startsAt, sql`now()`),
        ),
      ),
  );
  const covered = exists(
    executor
      .select({ one: sql`1` })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.companyId, companies.id),
          eq(subscriptions.status, "ACTIVE"),
          eq(subscriptions[key], true),
          inArray(subscriptions.kind, ["PLAN", "ADDON"]),
          lte(subscriptions.startsAt, sql`now()`),
          gt(subscriptions.endsAt, sql`now()`),
        ),
      ),
  );
  return sql<boolean>`coalesce((${companies.subscriptionUntil} > now() AND NOT ${planStarted}) OR ${covered}, false)`;
}

// Kolom select { attendance, payroll } untuk query yang memuat tabel companies.
export function addonFlagColumns(executor: Executor) {
  return {
    attendance: addonActiveSql(executor, "attendance"),
    payroll: addonActiveSql(executor, "payroll"),
  } satisfies Record<AddonKey, unknown>;
}

// Periode lunas (PLAN/ADDON) satu company + masa aktif setiap add-on.
// `executor` boleh transaksi (dipakai saat menerapkan tagihan lunas).
export async function loadAddonCoverage(
  executor: Executor,
  companyId: string,
  now = new Date(),
): Promise<Record<AddonKey, AddonCoverage> | null> {
  const [[company], rows] = await Promise.all([
    executor
      .select({ subscriptionUntil: companies.subscriptionUntil })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1),
    executor
      .select({
        kind: subscriptions.kind,
        attendance: subscriptions.attendance,
        payroll: subscriptions.payroll,
        startsAt: subscriptions.startsAt,
        endsAt: subscriptions.endsAt,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.companyId, companyId),
          eq(subscriptions.status, "ACTIVE"),
          inArray(subscriptions.kind, ["PLAN", "ADDON"]),
        ),
      )
      .orderBy(asc(subscriptions.startsAt)),
  ]);
  if (!company) return null;
  const periods = rows.flatMap((row) =>
    row.startsAt && row.endsAt ? [{ ...row, startsAt: row.startsAt, endsAt: row.endsAt }] : [],
  );
  return Object.fromEntries(
    ADDON_KEYS.map((key) => [key, addonCoverage(periods, key, company.subscriptionUntil, now)]),
  ) as Record<AddonKey, AddonCoverage>;
}
