// Pemberitahuan lembur (BUSINESS-FLOW §24.8), dipanggil di dalam after().
//
// Semua lewat lonceng (features/notifications), tanpa WhatsApp:
// - Pengajuan baru              → kartu "Lembur menunggu diproses" milik Owner; Admin HR setelah
//                                 waktu tunggu delegasi lembur (dihitung di notifications/queries.ts)
// - Ditugaskan                  → kabar untuk karyawan
// - Disetujui / ditolak         → kabar untuk karyawan pengaju
// - Dibatalkan Owner/Admin HR   → kabar untuk karyawan
// - Dibatalkan karyawan, atau karyawan "Tidak bisa hadir" → kabar untuk Owner & Admin HR

import "server-only";
import { createNotifications } from "@/features/notifications/service";
import { formatDateOnly } from "@/lib/dates";
import { getLeaveApprovers } from "./leave-notifications";
import { formatMinutes } from "./schedule";

export type OvertimeSummary = { workDate: string; startMinute: number; endMinute: number };

type Person = { id: string; fullName: string };

const HREF = "/attendance/overtime";

function whenText(order: OvertimeSummary) {
  return `${formatDateOnly(order.workDate)} · ${formatMinutes(order.startMinute)} – ${formatMinutes(order.endMinute)}`;
}

export async function notifyOvertimeAssigned(
  companyId: string,
  employeeId: string,
  order: OvertimeSummary,
  by: string,
) {
  await createNotifications([
    {
      companyId,
      userId: employeeId,
      kind: "OVERTIME_ASSIGNED",
      title: "Anda ditugaskan lembur",
      body: `${whenText(order)}. Ditugaskan oleh ${by}. Bila tidak bisa hadir, beri tahu lewat menu Lembur.`,
      href: HREF,
    },
  ]);
}

export async function notifyOvertimeDecided(
  companyId: string,
  employeeId: string,
  order: OvertimeSummary,
  decision: { approved: boolean; reason?: string | null },
) {
  await createNotifications([
    {
      companyId,
      userId: employeeId,
      kind: "OVERTIME_DECIDED",
      title: decision.approved ? "Lembur disetujui" : "Lembur ditolak",
      body: decision.approved
        ? `${whenText(order)}. Anda bisa absen di hari libur itu.`
        : `${whenText(order)}. Alasan: ${decision.reason ?? "-"}`,
      href: HREF,
    },
  ]);
}

// Owner/Admin HR membatalkan lembur karyawan.
export async function notifyOvertimeCancelledByManager(
  companyId: string,
  employeeId: string,
  order: OvertimeSummary,
  by: string,
) {
  await createNotifications([
    {
      companyId,
      userId: employeeId,
      kind: "OVERTIME_CANCELLED",
      title: "Lembur dibatalkan",
      body: `${whenText(order)}. Dibatalkan oleh ${by}.`,
      href: HREF,
    },
  ]);
}

async function notifyManagers(
  companyId: string,
  employee: Person,
  kind: "OVERTIME_CANCELLED" | "OVERTIME_DECLINED",
  title: string,
  body: string,
) {
  const managers = await getLeaveApprovers(companyId, ["OWNER", "HR_ADMIN"]);
  await createNotifications(
    managers
      .filter((person) => person.id !== employee.id)
      .map((person) => ({ companyId, userId: person.id, kind, title, body, href: HREF })),
  );
}

// Karyawan membatalkan pengajuan/lembur miliknya.
export async function notifyOvertimeCancelledByEmployee(companyId: string, employee: Person, order: OvertimeSummary) {
  await notifyManagers(
    companyId,
    employee,
    "OVERTIME_CANCELLED",
    `${employee.fullName} membatalkan lembur`,
    `${whenText(order)}.`,
  );
}

// Karyawan menolak penugasan ("Tidak bisa hadir").
export async function notifyOvertimeDeclined(
  companyId: string,
  employee: Person,
  order: OvertimeSummary,
  reason: string,
) {
  await notifyManagers(
    companyId,
    employee,
    "OVERTIME_DECLINED",
    `${employee.fullName} tidak bisa hadir lembur`,
    `${whenText(order)}. Alasan: ${reason}`,
  );
}
