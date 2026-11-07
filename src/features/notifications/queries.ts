// Pemberitahuan di lonceng navbar dan halaman /notifications (BUSINESS-FLOW §23).
//
// Dua sumber kartu:
// - Tugas & pengingat DIHITUNG LANGSUNG dari data yang ada, tanpa tabel. Kartu
//   hilang sendiri begitu urusannya selesai (nota diverifikasi, foto disetujui,
//   hari libur diisi, dan seterusnya).
// - Kabar sekali lewat ("uang muka ditolak", "cuti disetujui") disimpan di tabel
//   notifications (service.ts) dan hilang setelah dibuka (group "INFO").
//
// - Satu kartu = satu jenis urusan, jumlahnya ada di `count`. Angka di lonceng =
//   jumlah KARTU, bukan jumlah item.
// - Isi kartu mengikuti role & add-on (can()). Superadmin hanya melihat kartu
//   platform (error baru, tagihan menunggu verifikasi).
// - Dipanggil lonceng (layout) dan halaman /notifications pada permintaan yang
//   sama; cache() dari React membuat query hanya jalan sekali per permintaan.

import "server-only";
import { and, eq, lte, ne, sql } from "drizzle-orm";
import { io } from "next/cache";
import { cache } from "react";
import { todoLabel } from "@/features/advances/components/advance-todo-list";
import { listAdvances } from "@/features/advances/queries";
import { needsActionFrom } from "@/features/advances/service";
import { isPeriodLocked } from "@/features/attendance/period-lock";
import { getLeaveSettings } from "@/features/attendance/leave-queries";
import { countPendingFaces, getMyFaceProfiles, listHolidays } from "@/features/attendance/queries";
import { periodLabel, previousPeriod } from "@/features/attendance/review-data";
import { countNewErrorGroups } from "@/features/error-logs/queries";
import { listUnreadNotifications } from "./service";
import { listPayrollCandidates } from "@/features/payroll/queries";
import { listRuns } from "@/features/salaries/queries";
import { SETTLEMENT_TODO_LABELS } from "@/features/settlements/components/settlement-todo-list";
import { listSettlementTodos } from "@/features/settlements/queries";
import { countClaimedSubscriptions } from "@/features/subscriptions/queries";
import type { CompanyUser, CurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { logError } from "@/lib/error-log";
import { attendanceRecords, leaveRequests } from "@/lib/db/schema";
import { zonedDateString } from "@/lib/dates";

export type NotificationIcon =
  | "advance"
  | "settlement"
  | "face"
  | "leave"
  | "lock"
  | "payroll"
  | "calendar"
  | "subscription"
  | "error"
  | "billing"
  | "info";

export type NotificationCard = {
  key: string;
  group: "ACTION" | "REMINDER" | "INFO";
  // danger = mendesak (angka lonceng merah), warning = perlu segera, brand = biasa.
  tone: "danger" | "warning" | "brand";
  icon: NotificationIcon;
  title: string;
  description: string;
  href: string;
  // Jumlah item di balik kartu (null = kartu tunggal, tanpa angka).
  count: number | null;
  // Hanya kartu kabar (INFO): id baris notifications dan waktunya.
  notificationId?: string;
  at?: Date;
};

// Penggajian bulan ini yang belum dibuat mulai diingatkan pada tanggal ini.
const PAYROLL_REMINDER_DAY = 25;

export const getNotifications = cache(async (user: CurrentUser): Promise<NotificationCard[]> => {
  // Cache Components: data ini dinamis. io() HARUS ditunggu di sini, di luar try/catch
  // safely() di bawah; kalau ditunggu di dalamnya, penolakan io() saat prerender
  // ikut tertangkap dan dianggap error biasa (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md).
  await io();
  if (user.roles.includes("SUPERADMIN")) return safely("platform", platformCards());
  if (!user.company) return [];
  const me = user as CompanyUser;

  const groups = await Promise.all([
    safely("uang muka", advanceCards(me)),
    safely("absensi", attendanceCards(me)),
    safely("penggajian", payrollCards(me)),
    safely("langganan", subscriptionCards(me)),
    safely("kabar", infoCards(me)),
  ]);
  const cards = groups.flat();
  // Mendesak dulu, lalu perlu segera, lalu biasa; urutan lain mengikuti penyusunan.
  const rank = { danger: 0, warning: 1, brand: 2 } as const;
  return cards.toSorted((a, b) => rank[a.tone] - rank[b.tone]);
});

// Lonceng ada di setiap halaman: satu kelompok yang gagal (misal migration
// terbaru belum dijalankan) hanya dilewati dan dicatat, tidak boleh merusak halaman.
async function safely(label: string, pending: Promise<NotificationCard[]>): Promise<NotificationCard[]> {
  try {
    return await pending;
  } catch (error) {
    // Bukan kegagalan data: sinyal prerender Next.js harus diteruskan ke React.
    if (error instanceof Error && error.message.includes("During prerendering")) throw error;
    await logError(error, { source: "SERVER_ACTION", action: `pemberitahuan: ${label}` });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Kabar sekali lewat (belum dibuka)
// ---------------------------------------------------------------------------

const KIND_ICONS: Record<string, NotificationIcon> = {
  ADVANCE_REJECTED: "advance",
  ADVANCE_CANCELLED: "advance",
  SETTLEMENT_VERIFIED: "settlement",
  BALANCE_RECORDED: "payroll",
  LEAVE_DECIDED: "leave",
  LEAVE_CANCELLED: "leave",
  PAYSLIP_PUBLISHED: "payroll",
};

async function infoCards(user: CompanyUser): Promise<NotificationCard[]> {
  const rows = await listUnreadNotifications(user.id);
  return rows.map((row) => ({
    key: `n:${row.id}`,
    group: "INFO" as const,
    tone: "brand" as const,
    icon: KIND_ICONS[row.kind] ?? "info",
    title: row.title,
    description: row.body ?? "",
    href: row.href,
    count: null,
    notificationId: row.id,
    at: row.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Superadmin
// ---------------------------------------------------------------------------

async function platformCards(): Promise<NotificationCard[]> {
  const [errors, claimed] = await Promise.all([countNewErrorGroups(), countClaimedSubscriptions()]);
  const cards: NotificationCard[] = [];
  if (errors > 0) {
    cards.push({
      key: "platform-errors",
      group: "ACTION",
      tone: "danger",
      icon: "error",
      title: "Error baru di log",
      description: `${errors} masalah baru belum ditangani.`,
      href: "/error-logs",
      count: errors,
    });
  }
  if (claimed > 0) {
    cards.push({
      key: "platform-billing",
      group: "ACTION",
      tone: "warning",
      icon: "billing",
      title: "Tagihan menunggu verifikasi",
      description: `${claimed} pembayaran perlu dicek bukti transfernya.`,
      href: "/billing",
      count: claimed,
    });
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Uang muka & pertanggungjawaban (tugas milik user, atau seluruh perusahaan untuk Finance)
// ---------------------------------------------------------------------------

async function advanceCards(user: CompanyUser): Promise<NotificationCard[]> {
  if (!can(user, "advance:view-own")) return [];
  const viewAll = can(user, "advance:view-all");
  const [open, settlementTodos] = await Promise.all([
    listAdvances({
      companyId: user.company.id,
      recipientId: viewAll ? undefined : user.id,
      statuses: ["PENDING_APPROVAL", "APPROVED", "DISBURSED"],
    }),
    listSettlementTodos({ id: user.id, companyId: user.company.id, canVerify: can(user, "settlement:verify") }),
  ]);

  // Satu kartu per jenis tugas. Bila hanya satu, kartu langsung membuka dokumennya.
  const groups = new Map<
    string,
    { title: string; icon: NotificationIcon; tone: NotificationCard["tone"]; hrefs: string[]; people: string[] }
  >();
  const add = (
    key: string,
    title: string,
    icon: NotificationIcon,
    tone: NotificationCard["tone"],
    href: string,
    person: string,
  ) => {
    const group = groups.get(key) ?? { title, icon, tone, hrefs: [], people: [] };
    group.hrefs.push(href);
    group.people.push(person);
    groups.set(key, group);
  };

  for (const advance of open.filter((item) => needsActionFrom(item, user))) {
    const label = todoLabel(advance, user);
    add(`a:${label}`, label, "advance", "warning", `/advances/${advance.id}`, advance.recipientName);
  }
  for (const todo of settlementTodos) {
    const label = SETTLEMENT_TODO_LABELS[todo.kind];
    const urgent = todo.returnOverdue || todo.settlementDueAtPassed;
    add(`s:${todo.kind}`, label, "settlement", urgent ? "danger" : "warning", `/settlements/${todo.settlementId}`, todo.recipientName);
  }

  return [...groups.entries()].map(([key, group]) => {
    const count = group.hrefs.length;
    const own = key.startsWith("s:") && ["fill", "revise", "return", "ack-reimburse"].includes(key.slice(2));
    return {
      key,
      group: "ACTION" as const,
      tone: group.tone,
      icon: group.icon,
      title: group.title,
      description:
        count === 1
          ? own || group.people[0] === user.fullName
            ? "Menunggu Anda."
            : `Dari ${group.people[0]}.`
          : `${count} menunggu Anda.`,
      href: count === 1 ? group.hrefs[0] : "/projects",
      count,
    };
  });
}

// ---------------------------------------------------------------------------
// Absensi: foto wajah, cuti & izin, kunci periode, hari libur
// ---------------------------------------------------------------------------

async function attendanceCards(user: CompanyUser): Promise<NotificationCard[]> {
  if (!user.company.attendance) return [];
  await io();
  const companyId = user.company.id;
  const today = zonedDateString(new Date());
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const lastMonth = previousPeriod(today.slice(0, 7));

  const checksIn = can(user, "attendance:check-in");
  const approvesFaces = can(user, "attendance:approve-face");
  const decidesLeave = can(user, "leave:approve");
  const decidesDelegated = !decidesLeave && can(user, "leave:approve-delegated");
  const reviews = can(user, "attendance:review");
  const managesSettings = can(user, "attendance:configure");
  // Hari libur: diingatkan 1 Desember (untuk tahun depan) sampai akhir Januari
  // (bila tahun berjalan masih kosong).
  const holidayYear = month === 12 ? year + 1 : month === 1 ? year : null;

  const [myFaces, pendingFaces, pendingLeaves, lastMonthLocked, lastMonthHasRecords, holidays] = await Promise.all([
    checksIn ? getMyFaceProfiles(companyId, user.id) : null,
    approvesFaces ? countPendingFaces(companyId) : 0,
    decidesLeave || decidesDelegated ? countLeavesForMe(user, decidesDelegated) : 0,
    reviews ? isPeriodLocked(companyId, lastMonth) : true,
    reviews ? hasRecordsIn(companyId, lastMonth) : false,
    managesSettings && holidayYear ? listHolidays(companyId, holidayYear) : null,
  ]);

  const cards: NotificationCard[] = [];

  if (myFaces && !myFaces.approved) {
    if (myFaces.latest?.status === "REJECTED") {
      cards.push({
        key: "my-face-rejected",
        group: "ACTION",
        tone: "danger",
        icon: "face",
        title: "Foto wajah Anda ditolak",
        description: "Ambil ulang foto agar bisa absen.",
        href: "/attendance",
        count: null,
      });
    } else if (!myFaces.latest) {
      cards.push({
        key: "my-face-missing",
        group: "ACTION",
        tone: "warning",
        icon: "face",
        title: "Daftarkan foto wajah",
        description: "Foto acuan wajib ada sebelum Anda bisa absen.",
        href: "/attendance",
        count: null,
      });
    }
  }

  if (pendingFaces > 0) {
    cards.push({
      key: "faces-pending",
      group: "ACTION",
      tone: "warning",
      icon: "face",
      title: "Foto wajah menunggu persetujuan",
      description: `${pendingFaces} foto perlu dicocokkan dengan orangnya.`,
      href: "/attendance/faces",
      count: pendingFaces,
    });
  }

  if (pendingLeaves > 0) {
    cards.push({
      key: "leaves-pending",
      group: "ACTION",
      tone: "warning",
      icon: "leave",
      title: "Cuti & izin menunggu diproses",
      description: `${pendingLeaves} pengajuan menunggu keputusan Anda.`,
      href: "/attendance/leave",
      count: pendingLeaves,
    });
  }

  if (reviews && !lastMonthLocked && lastMonthHasRecords) {
    cards.push({
      key: "attendance-lock",
      group: "REMINDER",
      tone: "brand",
      icon: "lock",
      title: `Review & kunci absensi ${periodLabel(lastMonth)}`,
      description: "Denda baru masuk Potong Gaji, dan penggajian bisa diselesaikan, setelah periode dikunci.",
      href: `/attendance/review?period=${lastMonth}`,
      count: null,
    });
  }

  if (holidayYear && holidays && holidays.length === 0) {
    cards.push({
      key: "holidays-empty",
      group: "REMINDER",
      tone: "warning",
      icon: "calendar",
      title: `Hari libur ${holidayYear} belum diisi`,
      description: "Tanpa ini, hari libur dihitung sebagai hari kerja dan karyawan yang tidak absen dianggap tidak hadir.",
      href: "/settings#libur",
      count: null,
    });
  }

  return cards;
}

// Pengajuan cuti/izin orang lain yang menunggu: Owner semuanya; Admin HR hanya yang
// sudah lewat waktu tunggu delegasi (leave-rules.ts), dan hanya bila delegasi aktif.
async function countLeavesForMe(user: CompanyUser, delegated: boolean) {
  const companyId = user.company.id;
  let cutoff: Date | null = null;
  if (delegated) {
    const settings = await getLeaveSettings(companyId);
    if (!settings.leaveDelegationEnabled) return 0;
    cutoff = new Date(Date.now() - settings.leaveDelegationHours * 60 * 60 * 1000);
  }
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.companyId, companyId),
        eq(leaveRequests.status, "PENDING"),
        ne(leaveRequests.userId, user.id),
        cutoff ? lte(leaveRequests.createdAt, cutoff) : undefined,
      ),
    );
  return row?.count ?? 0;
}

// Ada catatan absen di bulan itu? (supaya perusahaan tanpa absen tidak diingatkan.)
async function hasRecordsIn(companyId: string, period: string) {
  const [row] = await db
    .select({ id: attendanceRecords.id })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.companyId, companyId), sql`${attendanceRecords.workDate}::text like ${`${period}-%`}`))
    .limit(1);
  return !!row;
}

// ---------------------------------------------------------------------------
// Penggajian
// ---------------------------------------------------------------------------

async function payrollCards(user: CompanyUser): Promise<NotificationCard[]> {
  if (!user.company.payroll) return [];
  await io();
  const today = zonedDateString(new Date());
  const thisMonth = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const [candidates, runs] = await Promise.all([
    can(user, "payroll:view") ? listPayrollCandidates(user.company.id) : null,
    can(user, "salary:prepare") ? listRuns(user.company.id) : null,
  ]);
  const cards: NotificationCard[] = [];

  if (candidates && candidates.length > 0) {
    cards.push({
      key: "payroll-deductions",
      group: "ACTION",
      tone: "warning",
      icon: "payroll",
      title: "Sisa uang muka menunggu dipotong gaji",
      description: `${candidates.length} sisa dana sudah lewat batas pengembalian.`,
      href: "/payroll-deductions",
      count: candidates.length,
    });
  }

  if (runs) {
    const draft = runs.find((run) => run.status !== "FINALIZED");
    const current = runs.find((run) => run.period === thisMonth);
    if (draft) {
      cards.push({
        key: "payroll-draft",
        group: "ACTION",
        tone: "brand",
        icon: "payroll",
        title: `Penggajian ${periodLabel(draft.period)} belum diselesaikan`,
        description: "Periksa, sesuaikan, lalu selesaikan agar slip gaji terbit.",
        href: `/payroll/${draft.period}`,
        count: null,
      });
    } else if (!current && day >= PAYROLL_REMINDER_DAY) {
      cards.push({
        key: "payroll-missing",
        group: "REMINDER",
        tone: "brand",
        icon: "payroll",
        title: `Penggajian ${periodLabel(thisMonth)} belum dibuat`,
        description: "Buat penggajian bulan ini sebelum tanggal gajian.",
        href: "/payroll",
        count: null,
      });
    }
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Langganan (Owner)
// ---------------------------------------------------------------------------

async function subscriptionCards(user: CompanyUser): Promise<NotificationCard[]> {
  const access = user.company.access;
  if (!access.needsReminder || !can(user, "subscription:view")) return [];
  const status = access.status;
  const title =
    status === "LOCKED"
      ? "Akses perusahaan dikunci"
      : status === "GRACE"
        ? "Masa aktif sudah habis (masa tenggang)"
        : status === "TRIAL"
          ? "Masa gratis segera berakhir"
          : "Masa langganan segera berakhir";
  return [
    {
      key: "subscription",
      group: "REMINDER",
      tone: status === "TRIAL" || status === "ACTIVE" ? "warning" : "danger",
      icon: "subscription",
      title,
      description:
        status === "LOCKED"
          ? "Tim Anda tidak bisa masuk sampai pembayaran diverifikasi."
          : access.daysLeft > 0
            ? `${access.daysLeft} hari lagi. Perpanjang agar tim tidak terkunci.`
            : "Perpanjang sekarang agar tim tidak terkunci.",
      href: "/subscription",
      count: null,
    },
  ];
}

// Dipakai di luar file ini bila perlu menyaring (misal angka lonceng merah).
export function hasUrgent(cards: NotificationCard[]) {
  return cards.some((card) => card.tone === "danger");
}

