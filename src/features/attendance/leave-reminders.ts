// Kabar delegasi cuti/izin ke Admin HR (BUSINESS-FLOW §19.4), dipanggil cron
// harian. Pengajuan yang belum diproses Owner setelah waktu tunggu delegasi
// boleh diproses Admin HR; cron mengirim SATU WhatsApp per Admin HR per
// company berisi pengajuan yang kini jadi tugasnya. Setiap pengajuan hanya
// dikabarkan sekali (leave_requests.delegate_notified_at). Admin HR tidak
// dikabari pengajuannya sendiri. Company nonaktif dilewati.

import "server-only";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { addonActiveSql } from "@/lib/addons-db";
import { db } from "@/lib/db";
import { companies, companySettings, leaveRequests, leaveTypes, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getLeaveApprovers, leavePeriodText } from "./leave-notifications";

export async function notifyDelegatedLeaves(now = new Date()) {
  const rows = await db
    .select({
      id: leaveRequests.id,
      companyId: leaveRequests.companyId,
      userId: leaveRequests.userId,
      number: leaveRequests.number,
      kind: leaveRequests.kind,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      timeMinute: leaveRequests.timeMinute,
      createdAt: leaveRequests.createdAt,
      hours: companySettings.leaveDelegationHours,
      typeName: leaveTypes.name,
      fullName: users.fullName,
    })
    .from(leaveRequests)
    .innerJoin(companies, eq(leaveRequests.companyId, companies.id))
    .innerJoin(companySettings, eq(companySettings.companyId, leaveRequests.companyId))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .where(
      and(
        eq(leaveRequests.status, "PENDING"),
        isNull(leaveRequests.delegateNotifiedAt),
        eq(companySettings.leaveDelegationEnabled, true),
        eq(companies.isActive, true),
        addonActiveSql(db, "attendance"), // add-on Absensi aktif
        lte(leaveRequests.createdAt, now),
      ),
    );
  const due = rows.filter((row) => row.createdAt.getTime() + row.hours * 3_600_000 <= now.getTime());

  const byCompany = new Map<string, typeof due>();
  for (const row of due) byCompany.set(row.companyId, [...(byCompany.get(row.companyId) ?? []), row]);

  let notified = 0;
  for (const [companyId, requests] of byCompany) {
    const ids = requests.map((request) => request.id);
    // Tandai dulu agar cron yang berjalan dua kali tidak mengirim ganda.
    await db.update(leaveRequests).set({ delegateNotifiedAt: now }).where(inArray(leaveRequests.id, ids));

    const hrAdmins = (await getLeaveApprovers(companyId, ["HR_ADMIN"])).filter((person) => person.phoneNumber);
    const link = new URL("/attendance/leave", env.NEXT_PUBLIC_APP_URL).toString();
    const messages = hrAdmins.flatMap((person) => {
      const mine = requests.filter((request) => request.userId !== person.id);
      if (mine.length === 0) return [];
      const lines = mine.map(
        (request) => `- ${request.number} ${request.fullName}: ${request.typeName}, ${leavePeriodText(request)}`,
      );
      return [
        {
          to: person.phoneNumber!,
          text:
            `Halo ${person.fullName},\n\n${mine.length} pengajuan cuti/izin belum diproses Owner dan kini bisa Anda ` +
            `setujui atau tolak (delegasi):\n${lines.join("\n")}\n\n${link}`,
        },
      ];
    });
    const results = await Promise.allSettled(messages.map((message) => sendWhatsApp(message)));
    if (results.some((result) => result.status === "fulfilled" && result.value)) notified += 1;
    // Semua gagal → coba lagi besok. Tanpa Admin HR bernomor: tidak dicoba ulang.
    else if (messages.length > 0) {
      await db.update(leaveRequests).set({ delegateNotifiedAt: null }).where(inArray(leaveRequests.id, ids));
    }
  }
  return { companies: notified };
}
