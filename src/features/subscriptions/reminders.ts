// Pengingat masa gratis/langganan (BUSINESS-FLOW §17): H-3 dan H-1 sebelum
// `companies.subscription_until`, ke semua Owner aktif lewat WhatsApp & email.
// Dijalankan harian bersama pengingat uang muka (app/api/cron/reminders).
//
// Anti-dobel: `companies.last_reminder_key` menyimpan "<tanggal berakhir>:<H->"
// yang terakhir dikirim; bila cron berjalan dua kali sehari, company yang sama
// tidak dikirimi lagi. Setelah diperpanjang tanggal berakhir berubah, sehingga
// pengingat periode berikutnya tetap terkirim.

import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { zonedDateString } from "@/lib/dates";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { addDays } from "@/lib/subscription-access";
import { notifyOwners } from "./notifications";

export const REMINDER_OFFSETS = [3, 1] as const; // H-3, H-1

export type SubscriptionReminderResult = { companyId: string; daysLeft: number; contacted: number };

export async function sendSubscriptionReminders(now = new Date()): Promise<SubscriptionReminderResult[]> {
  const maxOffset = Math.max(...REMINDER_OFFSETS);
  // Tanggal kalender (zona waktu aplikasi) → H- yang cocok hari ini.
  const targets = new Map(REMINDER_OFFSETS.map((offset) => [zonedDateString(addDays(now, offset)), offset]));

  const candidates = await db
    .select({
      id: companies.id,
      subscriptionUntil: companies.subscriptionUntil,
      lastReminderKey: companies.lastReminderKey,
    })
    .from(companies)
    .where(
      and(
        eq(companies.isActive, true),
        gte(companies.subscriptionUntil, now),
        lte(companies.subscriptionUntil, addDays(now, maxOffset + 1)),
      ),
    );

  const results: SubscriptionReminderResult[] = [];
  for (const company of candidates) {
    const untilDate = zonedDateString(company.subscriptionUntil);
    const offset = targets.get(untilDate);
    if (offset === undefined) continue;
    const key = `${untilDate}:${offset}`;
    if (company.lastReminderKey === key) continue;

    // Tandai lebih dulu agar cron yang berjalan bersamaan tidak ikut mengirim.
    const [claimed] = await db
      .update(companies)
      .set({ lastReminderKey: key })
      .where(and(eq(companies.id, company.id), sql`${companies.lastReminderKey} IS DISTINCT FROM ${key}`))
      .returning({ id: companies.id });
    if (!claimed) continue;

    const contacted = await notifyOwners(company.id, {
      kind: "reminder",
      until: company.subscriptionUntil,
      daysLeft: offset,
    });
    results.push({ companyId: company.id, daysLeft: offset, contacted });
  }
  return results;
}
