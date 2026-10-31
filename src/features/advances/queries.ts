// Query database untuk uang muka. Hasilnya DTO (hanya kolom yang dibutuhkan).
//
// Pemanggil WAJIB sudah memastikan user boleh melihat datanya: halaman
// daftar menyaring per penerima untuk karyawan, halaman detail mengecek
// "penerima atau advance:view-all". Semua fungsi menerima companyId (company
// yang sedang dibuka) sehingga data company lain tidak pernah terbaca.
//
// Satu uang muka berhubungan dengan beberapa user (penerima, pencatat,
// penyetuju, pencair). alias() membuat tabel users bisa di-join beberapa kali
// dengan nama berbeda dalam satu query.
//
// Referensi:
// - https://orm.drizzle.team/docs/joins (bagian "Aliases & Selfjoins")
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md

import "server-only";
import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import { can } from "@/lib/auth/permissions";
import { isRole, type Role } from "@/lib/auth/roles";
import { notSuperadmin } from "@/lib/auth/superadmin";
import { db } from "@/lib/db";
import { advanceRequests, projects, roles, userRoles, users } from "@/lib/db/schema";
import { projectCondition } from "@/features/projects/queries";
import {
  ADVANCE_STATUS,
  AWAITING_RECEIPT_STATUSES,
  type AdvanceStatus,
  type DisbursementMethod,
} from "./constants";

export type AdvanceListItem = {
  id: string;
  number: string; // "UM-2026-10-0001"
  status: AdvanceStatus;
  amount: number;
  purpose: string;
  disbursementMethod: DisbursementMethod;
  recipientId: string;
  recipientName: string;
  createdById: string;
  disbursedById: string | null;
  disputedAt: Date | null;
  settlementDueAt: Date | null;
  // true bila batas unggah nota sudah lewat. Dihitung PostgreSQL saat query
  // (bukan disimpan), jadi selalu benar tanpa perlu cron.
  settlementDueAtPassed: boolean;
  createdAt: Date;
};

export type AdvanceDetail = AdvanceListItem & {
  projectId: string | null; // null = uang muka lama, belum punya project
  projectName: string | null;
  recipientEmail: string;
  createdByName: string;
  decidedByName: string | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  disbursedByName: string | null;
  disbursedAt: Date | null;
  transferReference: string | null;
  destinationBankName: string | null;
  destinationAccountNumber: string | null;
  returnDueDays: number | null;
  acknowledgedAt: Date | null;
  acknowledgmentText: string | null;
  acknowledgmentIp: string | null;
  disputeReason: string | null;
  cancelledByName: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
};

const recipient = alias(users, "recipient");

const listColumns = {
  id: advanceRequests.id,
  number: advanceRequests.number,
  status: advanceRequests.status,
  amount: advanceRequests.amount,
  purpose: advanceRequests.purpose,
  disbursementMethod: advanceRequests.disbursementMethod,
  recipientId: advanceRequests.recipientId,
  recipientName: recipient.fullName,
  createdById: advanceRequests.createdById,
  disbursedById: advanceRequests.disbursedById,
  disputedAt: advanceRequests.disputedAt,
  settlementDueAt: advanceRequests.settlementDueAt,
  settlementDueAtPassed: sql<boolean>`coalesce(${advanceRequests.settlementDueAt} < now(), false)`,
  createdAt: advanceRequests.createdAt,
};

// Kolom status & metode bertipe varchar di database. Nilainya hanya ditulis
// oleh Server Action di features/advances/actions.ts, jadi aman di-cast.
function withTypes<T extends { status: string; disbursementMethod: string }>(row: T) {
  return {
    ...row,
    status: row.status as AdvanceStatus,
    disbursementMethod: row.disbursementMethod as DisbursementMethod,
  };
}

// recipientId diisi → hanya uang muka milik user itu (untuk karyawan).
// year/month → periode nomor transaksi (UM-2026-10-xxxx = Oktober 2026).
// Tanpa limit untuk daftar "perlu tindakan" (jumlahnya kecil karena
// disaring per status); daftar riwayat dibatasi agar halaman tetap ringan.
export async function listAdvances(filter: {
  companyId: string;
  recipientId?: string;
  // id project, atau NO_PROJECT untuk uang muka lama tanpa project.
  project?: string;
  statuses?: readonly AdvanceStatus[];
  year?: number;
  month?: number;
  limit?: number;
}): Promise<AdvanceListItem[]> {
  await io();
  const query = db
    .select(listColumns)
    .from(advanceRequests)
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .where(
      and(
        eq(advanceRequests.companyId, filter.companyId),
        filter.recipientId ? eq(advanceRequests.recipientId, filter.recipientId) : undefined,
        projectCondition(filter.project),
        filter.statuses ? inArray(advanceRequests.status, [...filter.statuses]) : undefined,
        filter.year ? eq(advanceRequests.periodYear, filter.year) : undefined,
        filter.month ? eq(advanceRequests.periodMonth, filter.month) : undefined,
      ),
    )
    .orderBy(desc(advanceRequests.createdAt));

  const rows = filter.limit ? await query.limit(filter.limit) : await query;
  return rows.map(withTypes);
}

// Tahun yang punya uang muka, terbaru dulu. Untuk pilihan filter Tahun.
export async function listAdvanceYears(filter: {
  companyId: string;
  recipientId?: string;
  project?: string;
}): Promise<number[]> {
  await io();
  const rows = await db
    .selectDistinct({ year: advanceRequests.periodYear })
    .from(advanceRequests)
    .where(
      and(
        eq(advanceRequests.companyId, filter.companyId),
        filter.recipientId ? eq(advanceRequests.recipientId, filter.recipientId) : undefined,
        projectCondition(filter.project),
      ),
    )
    .orderBy(desc(advanceRequests.periodYear));
  return rows.map((row) => row.year);
}

// Ringkasan untuk kartu di Beranda: jumlah & total nominal per status,
// plus berapa yang sudah melewati batas unggah nota. Dihitung di database
// (GROUP BY), bukan dengan mengambil semua baris lalu menjumlah di server.
export type AdvanceSummary = Record<
  AdvanceStatus,
  { count: number; amount: number; overdueCount: number }
>;

export async function getAdvanceSummary(filter: {
  companyId: string;
  recipientId?: string;
}): Promise<AdvanceSummary> {
  await io();
  const rows = await db
    .select({
      status: advanceRequests.status,
      count: sql`count(*)`.mapWith(Number),
      // sum() bigint menghasilkan numeric (string di postgres.js) → Number.
      amount: sql`coalesce(sum(${advanceRequests.amount}), 0)`.mapWith(Number),
      overdueCount: sql`count(*) filter (where ${advanceRequests.settlementDueAt} < now())`.mapWith(Number),
    })
    .from(advanceRequests)
    .where(
      and(
        eq(advanceRequests.companyId, filter.companyId),
        filter.recipientId ? eq(advanceRequests.recipientId, filter.recipientId) : undefined,
      ),
    )
    .groupBy(advanceRequests.status);

  const summary = Object.fromEntries(
    ADVANCE_STATUS.map((status) => [status, { count: 0, amount: 0, overdueCount: 0 }]),
  ) as AdvanceSummary;
  for (const { status, ...values } of rows) {
    if (status in summary) summary[status as AdvanceStatus] = values;
  }
  return summary;
}

export async function getAdvanceDetail(companyId: string, id: string): Promise<AdvanceDetail | null> {
  await io();
  const createdBy = alias(users, "created_by");
  const decidedBy = alias(users, "decided_by");
  const disbursedBy = alias(users, "disbursed_by");
  const cancelledBy = alias(users, "cancelled_by");

  const [row] = await db
    .select({
      ...listColumns,
      projectId: advanceRequests.projectId,
      projectName: projects.name,
      recipientEmail: recipient.email,
      createdByName: createdBy.fullName,
      decidedByName: decidedBy.fullName,
      decidedAt: advanceRequests.decidedAt,
      rejectionReason: advanceRequests.rejectionReason,
      disbursedByName: disbursedBy.fullName,
      disbursedAt: advanceRequests.disbursedAt,
      transferReference: advanceRequests.transferReference,
      destinationBankName: advanceRequests.destinationBankName,
      destinationAccountNumber: advanceRequests.destinationAccountNumber,
      returnDueDays: advanceRequests.returnDueDays,
      acknowledgedAt: advanceRequests.acknowledgedAt,
      acknowledgmentText: advanceRequests.acknowledgmentText,
      acknowledgmentIp: advanceRequests.acknowledgmentIp,
      disputeReason: advanceRequests.disputeReason,
      cancelledByName: cancelledBy.fullName,
      cancelledAt: advanceRequests.cancelledAt,
      cancellationReason: advanceRequests.cancellationReason,
    })
    .from(advanceRequests)
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .innerJoin(createdBy, eq(advanceRequests.createdById, createdBy.id))
    .leftJoin(projects, eq(advanceRequests.projectId, projects.id))
    .leftJoin(decidedBy, eq(advanceRequests.decidedById, decidedBy.id))
    .leftJoin(disbursedBy, eq(advanceRequests.disbursedById, disbursedBy.id))
    .leftJoin(cancelledBy, eq(advanceRequests.cancelledById, cancelledBy.id))
    .where(and(eq(advanceRequests.id, id), eq(advanceRequests.companyId, companyId)))
    .limit(1);

  return row ? withTypes(row) : null;
}

export type RecipientOption = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
};

const recipientColumns = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  phoneNumber: users.phoneNumber,
  bankName: users.bankName,
  bankAccountNumber: users.bankAccountNumber,
};

// Calon penerima: semua user aktif di company ini kecuali pencatat sendiri
// (pemberi dan penerima dana harus orang berbeda) dan superadmin.
export async function listRecipientOptions(companyId: string, excludeUserId: string): Promise<RecipientOption[]> {
  await io();
  return db
    .select(recipientColumns)
    .from(users)
    .where(
      and(
        eq(users.companyId, companyId),
        eq(users.isActive, true),
        ne(users.id, excludeUserId),
        notSuperadmin(users.id),
      ),
    )
    .orderBy(asc(users.fullName));
}

export async function getActiveRecipient(companyId: string, userId: string): Promise<RecipientOption | null> {
  const [row] = await db
    .select(recipientColumns)
    .from(users)
    .where(
      and(eq(users.id, userId), eq(users.companyId, companyId), eq(users.isActive, true), notSuperadmin(users.id)),
    )
    .limit(1);
  return row ?? null;
}

export type Contact = { id: string; fullName: string; phoneNumber: string | null };

// Kontak untuk notifikasi: user tertentu (misal pencair dana) + semua OWNER
// aktif di company ini, tanpa duplikat. Dipakai untuk laporan "tidak sesuai"
// & konfirmasi.
export async function getOwnerContacts(companyId: string, extraUserIds: (string | null)[]): Promise<Contact[]> {
  const contactColumns = { id: users.id, fullName: users.fullName, phoneNumber: users.phoneNumber };

  const owners = await db
    .select(contactColumns)
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(users.companyId, companyId), eq(roles.name, "OWNER"), eq(users.isActive, true)));

  const ids = extraUserIds.filter((id): id is string => !!id);
  const extras = ids.length
    ? await db
        .select(contactColumns)
        .from(users)
        .where(and(inArray(users.id, ids), eq(users.companyId, companyId), eq(users.isActive, true)))
    : [];

  return [...new Map([...owners, ...extras].map((contact) => [contact.id, contact])).values()];
}

// Semua user aktif di company ini yang boleh menyetujui uang muka
// (advance:approve). Dicek lewat can() agar tetap mengikuti ROLE_PERMISSIONS,
// bukan nama role. Saring lagi dengan eligibleApprovers() (service.ts) per uang muka.
export async function listApprovers(companyId: string): Promise<Contact[]> {
  await io();
  const rows = await db
    .select({ id: users.id, fullName: users.fullName, phoneNumber: users.phoneNumber, role: roles.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(users.companyId, companyId), eq(users.isActive, true)));

  const people = new Map<string, Contact & { roles: Role[] }>();
  for (const { role, ...contact } of rows) {
    const person = people.get(contact.id) ?? { ...contact, roles: [] };
    if (isRole(role)) person.roles.push(role);
    people.set(contact.id, person);
  }
  return [...people.values()]
    .filter((person) => can(person, "advance:approve"))
    .map(({ id, fullName, phoneNumber }) => ({ id, fullName, phoneNumber }));
}

// Uang muka yang sudah lewat batas unggah nota tetapi nota belum dikirim (atau
// dikembalikan untuk diperbaiki), dihitung per penerima. Status yang dihitung
// sama dengan pengingat "batas nota terlewati" (AWAITING_RECEIPT_STATUSES).
// Dikembalikan sebagai objek biasa agar bisa dikirim ke Client Component.
export async function countOverdueAdvances(
  companyId: string,
  recipientIds: string[],
): Promise<Record<string, number>> {
  if (recipientIds.length === 0) return {};
  await io();
  const rows = await db
    .select({ recipientId: advanceRequests.recipientId, count: sql<number>`count(*)::int` })
    .from(advanceRequests)
    .where(
      and(
        eq(advanceRequests.companyId, companyId),
        inArray(advanceRequests.recipientId, recipientIds),
        inArray(advanceRequests.status, [...AWAITING_RECEIPT_STATUSES]),
        lt(advanceRequests.settlementDueAt, sql`now()`),
      ),
    )
    .groupBy(advanceRequests.recipientId);
  return Object.fromEntries(rows.map((row) => [row.recipientId, row.count]));
}
