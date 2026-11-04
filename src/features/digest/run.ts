// Ringkasan email harian ke Owner & Finance (BUSINESS-FLOW §10), dipanggil
// cron harian (app/api/cron/reminders/route.ts) SETELAH pengingat uang muka,
// karena bagian "Lewat batas" membaca reminder_logs yang baru dicatat.
//
// Menggantikan WhatsApp informasi ke Owner/Finance (konfirmasi terima dana,
// pertanggungjawaban dikirim, pengingat lewat batas) agar hemat kuota
// WhatsApp. Email hanya dikirim bila ada isinya.
//
// Anti-dobel: digest_logs (user + tanggal) dicatat sebelum email dikirim;
// bila gagal terkirim, catatannya dihapus agar dicoba di jadwal berikutnya.
// Company nonaktif dan yang terkunci (masa gratis habis, atau lewat masa
// tenggang bagi company berbayar) dilewati.

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { hasPaidSubscription } from "@/features/subscriptions/queries";
import { addonActiveSql } from "@/lib/addons-db";
import { db } from "@/lib/db";
import { companies, digestLogs, roles, userRoles, users } from "@/lib/db/schema";
import { zonedDateString } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getCompanyAccess } from "@/lib/subscription-access";
import { digestEmail, type DigestAudience } from "./email";
import { getDigestData } from "./queries";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function sendDailyDigests() {
  const now = new Date();
  const since = new Date(now.getTime() - DAY_MS);
  const today = zonedDateString(now);
  const { graceDays } = await getPlatformSettings();

  const activeCompanies = (
    await db
      .select({
        id: companies.id,
        name: companies.name,
        subscriptionUntil: companies.subscriptionUntil,
        hasPaid: hasPaidSubscription(),
        attendance: addonActiveSql(db, "attendance"),
      })
      .from(companies)
      .where(eq(companies.isActive, true))
  ).filter((company) => !getCompanyAccess({ ...company, graceDays, now }).locked);

  let sent = 0;
  for (const company of activeCompanies) {
    const people = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email, role: roles.name })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(users.companyId, company.id), eq(users.isActive, true), inArray(roles.name, ["OWNER", "FINANCE"])));
    if (people.length === 0) continue;

    // Satu email per orang; Owner yang juga Finance menerima versi Owner.
    const recipients = new Map<string, { fullName: string; email: string; audience: DigestAudience }>();
    for (const person of people) {
      const current = recipients.get(person.id);
      if (!current || person.role === "OWNER") {
        recipients.set(person.id, {
          fullName: person.fullName,
          email: person.email,
          audience: person.role === "OWNER" ? "owner" : "finance",
        });
      }
    }

    const data = await getDigestData(company.id, since, { attendance: company.attendance });
    for (const [userId, person] of recipients) {
      const message = digestEmail({
        to: person.email,
        fullName: person.fullName,
        companyName: company.name,
        audience: person.audience,
        data,
        now,
      });
      if (!message) continue;

      const [log] = await db
        .insert(digestLogs)
        .values({ userId, digestDate: today })
        .onConflictDoNothing()
        .returning({ userId: digestLogs.userId });
      if (!log) continue; // sudah dikirim hari ini

      if (await sendEmail(message)) sent += 1;
      else await db.delete(digestLogs).where(and(eq(digestLogs.userId, userId), eq(digestLogs.digestDate, today)));
    }
  }
  return { emails: sent };
}
