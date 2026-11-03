// WhatsApp cuti & izin (BUSINESS-FLOW §19). Dipanggil di dalam after() agar
// tombol tidak menunggu Fonnte. Penerima tanpa nomor dilewati.
//
// - Pengajuan baru         → Owner & Admin HR (selain pengaju)
// - Disetujui / ditolak    → karyawan pengaju
// - Cuti disetujui dibatalkan → Owner
// Kabar delegasi ke Admin HR dikirim cron (leave-reminders.ts).

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema";
import { formatDateOnly } from "@/lib/dates";
import { env } from "@/lib/env";
import { sendWhatsApp } from "@/lib/whatsapp";
import { formatMinutes } from "./schedule";

export type LeaveSummary = {
  number: string;
  typeName: string;
  kind: string;
  startDate: string;
  endDate: string;
  days: number;
  timeMinute: number | null;
  reason: string;
};

type Person = { id: string; fullName: string; phoneNumber: string | null };

export function leavePeriodText(leave: Pick<LeaveSummary, "kind" | "startDate" | "endDate" | "days" | "timeMinute">) {
  if (leave.kind === "LATE_ARRIVAL") {
    return `${formatDateOnly(leave.startDate)}, datang paling lambat ${formatMinutes(leave.timeMinute ?? 0)}`;
  }
  if (leave.kind === "EARLY_LEAVE") {
    return `${formatDateOnly(leave.startDate)}, pulang mulai ${formatMinutes(leave.timeMinute ?? 0)}`;
  }
  const range =
    leave.startDate === leave.endDate
      ? formatDateOnly(leave.startDate)
      : `${formatDateOnly(leave.startDate)} – ${formatDateOnly(leave.endDate)}`;
  return `${range} (${leave.days} hari kerja)`;
}

const link = () => new URL("/attendance/leave", env.NEXT_PUBLIC_APP_URL).toString();

// Owner & Admin HR aktif di company (penyetuju cuti/izin).
export async function getLeaveApprovers(companyId: string, roleNames: ("OWNER" | "HR_ADMIN")[]): Promise<Person[]> {
  const rows = await db
    .select({ id: users.id, fullName: users.fullName, phoneNumber: users.phoneNumber })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(users.companyId, companyId), eq(users.isActive, true), inArray(roles.name, roleNames)));
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

export async function notifyLeaveRequested(companyId: string, requester: Person, leave: LeaveSummary) {
  const approvers = (await getLeaveApprovers(companyId, ["OWNER", "HR_ADMIN"])).filter(
    (person) => person.id !== requester.id,
  );
  await send(
    approvers,
    (person) =>
      `Halo ${person.fullName},\n\n${requester.fullName} mengajukan *${leave.typeName}* (${leave.number}): ` +
      `${leavePeriodText(leave)}.\nAlasan: ${leave.reason}\n\nSetujui atau tolak di ArchiPay:\n${link()}`,
  );
}

export async function notifyLeaveDecided(
  recipient: Person,
  leave: LeaveSummary,
  decision: { approved: boolean; reason?: string | null },
) {
  await send(
    [recipient],
    () =>
      `Halo ${recipient.fullName},\n\nPengajuan *${leave.typeName}* (${leave.number}) untuk ${leavePeriodText(leave)} ` +
      (decision.approved ? "*disetujui*." : `*ditolak*.\nAlasan: ${decision.reason ?? "-"}`) +
      `\n\n${link()}`,
  );
}

export async function notifyLeaveCancelled(companyId: string, requester: Person, leave: LeaveSummary, note: string) {
  const owners = await getLeaveApprovers(companyId, ["OWNER"]);
  await send(
    owners.filter((person) => person.id !== requester.id),
    (person) =>
      `Halo ${person.fullName},\n\n${requester.fullName} membatalkan *${leave.typeName}* (${leave.number}) ` +
      `yang sudah disetujui. ${note}\n\n${link()}`,
  );
}

async function send(people: Person[], text: (person: Person) => string) {
  await Promise.allSettled(
    people
      .filter((person) => person.phoneNumber)
      .map((person) => sendWhatsApp({ to: person.phoneNumber!, text: text(person) })),
  );
}
