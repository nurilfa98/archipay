// Query database fitur langganan. Pemanggil WAJIB sudah mengecek hak akses:
// Owner hanya boleh memanggil dengan company miliknya sendiri, Superadmin
// (company:manage) boleh semua company.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md

import "server-only";
import { and, asc, count, desc, eq, exists, inArray, sql } from "drizzle-orm";
import { io } from "next/cache";
import { db } from "@/lib/db";
import { companies, companyPricing, paymentBankAccounts, subscriptionPayments, subscriptions } from "@/lib/db/schema";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getCompanyAccess, type CompanyAccess } from "@/lib/subscription-access";
import {
  OPEN_SUBSCRIPTION_STATUSES,
  type PaymentStatus,
  type PlanMonths,
  type SubscriptionKind,
  type SubscriptionStatus,
} from "./constants";
import type { Pricing } from "./pricing";
import { getSeatUsage } from "./seats";

const LIST_LIMIT = 300;

export type CompanyPricing = {
  pricing: Pricing; // yang berlaku untuk company ini
  standard: Pricing;
  // Harga khusus per komponen (null = ikut standar), atau null bila tidak ada.
  override: {
    basePrice: number | null;
    includedUsers: number | null;
    extraUserPrice: number | null;
    note: string | null;
  } | null;
};

export type PaymentItem = {
  id: string;
  status: PaymentStatus;
  // Bukti dibuka lewat /api/subscription-payments/<id>/proof.
  proof: "image" | "pdf" | null;
  note: string | null;
  amountReceived: number | null;
  reviewNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

export type SubscriptionItem = {
  id: string;
  companyId: string;
  companyName: string;
  kind: SubscriptionKind;
  months: PlanMonths | null; // null untuk tambah kuota
  users: number; // pengguna paket, atau tambahan pengguna (TOPUP)
  price: number;
  amountPaid: number;
  status: SubscriptionStatus;
  note: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  paidAt: Date | null;
  rejectedAt: Date | null;
  rejectionNote: string | null;
  createdAt: Date;
  // Semua pembayaran tagihan ini, lama → baru.
  payments: PaymentItem[];
};

export type CompanySubscriptionState = {
  access: CompanyAccess;
  seats: { limit: number; active: number };
  // Tagihan terbuka (menunggu verifikasi / kurang bayar); maksimal satu.
  open: SubscriptionItem | null;
  // Penolakan terakhir bila itu kejadian paling baru: pemberitahuan ke Owner.
  lastRejected: SubscriptionItem | null;
};

export type BankAccount = { id: string; bankName: string; accountNumber: string; accountName: string };

// Komponen harga standar (Pengaturan platform).
export async function getStandardPricing(): Promise<Pricing> {
  const { basePrice, includedUsers, extraUserPrice, discount6, discount12 } = await getPlatformSettings();
  return { basePrice, includedUsers, extraUserPrice, discount6, discount12 };
}

// Harga yang berlaku untuk satu company: harga khusus (per komponen) bila ada,
// selain itu standar. Diskon 6/12 bulan selalu standar.
export async function getCompanyPricing(companyId: string): Promise<CompanyPricing> {
  await io();
  const [standard, [override]] = await Promise.all([
    getStandardPricing(),
    db
      .select({
        basePrice: companyPricing.basePrice,
        includedUsers: companyPricing.includedUsers,
        extraUserPrice: companyPricing.extraUserPrice,
        note: companyPricing.note,
      })
      .from(companyPricing)
      .where(eq(companyPricing.companyId, companyId))
      .limit(1),
  ]);
  return {
    standard,
    override: override ?? null,
    pricing: {
      ...standard,
      basePrice: override?.basePrice ?? standard.basePrice,
      includedUsers: override?.includedUsers ?? standard.includedUsers,
      extraUserPrice: override?.extraUserPrice ?? standard.extraUserPrice,
    },
  };
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  await io();
  return db
    .select({
      id: paymentBankAccounts.id,
      bankName: paymentBankAccounts.bankName,
      accountNumber: paymentBankAccounts.accountNumber,
      accountName: paymentBankAccounts.accountName,
    })
    .from(paymentBankAccounts)
    .orderBy(asc(paymentBankAccounts.createdAt));
}

// Subquery "company ini pernah punya tagihan lunas", untuk membedakan masa
// gratis vs langganan aktif. Dipakai juga lib/auth/dal.ts & features/companies.
export function hasPaidSubscription() {
  return sql<boolean>`${exists(
    db
      .select({ one: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.companyId, companies.id), eq(subscriptions.status, "ACTIVE"))),
  )}`;
}

// Status akses + tagihan terbuka satu company (halaman Langganan, detail company).
export async function getCompanySubscriptionState(companyId: string): Promise<CompanySubscriptionState | null> {
  await io();
  const [[company], settings, [latest], seats] = await Promise.all([
    db
      .select({ subscriptionUntil: companies.subscriptionUntil, hasPaid: hasPaidSubscription() })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1),
    getPlatformSettings(),
    listSubscriptions({ companyId, limit: 1 }),
    getSeatUsage(companyId),
  ]);
  if (!company) return null;
  const isOpen = latest && (OPEN_SUBSCRIPTION_STATUSES as readonly string[]).includes(latest.status);
  return {
    access: getCompanyAccess({
      subscriptionUntil: company.subscriptionUntil,
      hasPaid: company.hasPaid,
      graceDays: settings.graceDays,
    }),
    seats,
    // Tagihan terbuka selalu yang terbaru: tagihan baru hanya bisa dibuat
    // bila tidak ada yang terbuka.
    open: isOpen ? latest : null,
    lastRejected: latest?.status === "REJECTED" ? latest : null,
  };
}

// Daftar tagihan satu company atau semua company (companyId kosong). Yang
// perlu tindakan (menunggu verifikasi, lalu kurang bayar) di atas.
export async function listSubscriptions({
  companyId,
  statuses,
  limit = LIST_LIMIT,
}: {
  companyId?: string;
  statuses?: readonly SubscriptionStatus[];
  limit?: number;
}): Promise<SubscriptionItem[]> {
  await io();
  const rows = await db
    .select({
      id: subscriptions.id,
      companyId: subscriptions.companyId,
      companyName: companies.name,
      kind: subscriptions.kind,
      months: subscriptions.months,
      users: subscriptions.users,
      price: subscriptions.price,
      amountPaid: subscriptions.amountPaid,
      status: subscriptions.status,
      note: subscriptions.note,
      startsAt: subscriptions.startsAt,
      endsAt: subscriptions.endsAt,
      paidAt: subscriptions.paidAt,
      rejectedAt: subscriptions.rejectedAt,
      rejectionNote: subscriptions.rejectionNote,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .innerJoin(companies, eq(subscriptions.companyId, companies.id))
    .where(
      and(
        companyId ? eq(subscriptions.companyId, companyId) : undefined,
        statuses?.length ? inArray(subscriptions.status, [...statuses]) : undefined,
      ),
    )
    .orderBy(
      // Satu company: terbaru dulu. Semua company: yang perlu tindakan dulu.
      ...(companyId
        ? [desc(subscriptions.createdAt)]
        : [sql`CASE ${subscriptions.status} WHEN 'CLAIMED' THEN 0 WHEN 'UNDERPAID' THEN 1 ELSE 2 END`, desc(subscriptions.updatedAt)]),
    )
    .limit(limit);

  const payments = await listPaymentsOf(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    kind: row.kind as SubscriptionKind,
    months: row.months as PlanMonths | null,
    status: row.status as SubscriptionStatus,
    payments: payments.get(row.id) ?? [],
  }));
}

// Semua pembayaran untuk daftar tagihan, dalam satu query (bukan per tagihan).
async function listPaymentsOf(subscriptionIds: string[]) {
  const result = new Map<string, PaymentItem[]>();
  if (subscriptionIds.length === 0) return result;
  const rows = await db
    .select({
      id: subscriptionPayments.id,
      subscriptionId: subscriptionPayments.subscriptionId,
      status: subscriptionPayments.status,
      proofKey: subscriptionPayments.proofKey,
      proofContentType: subscriptionPayments.proofContentType,
      note: subscriptionPayments.note,
      amountReceived: subscriptionPayments.amountReceived,
      reviewNote: subscriptionPayments.reviewNote,
      createdAt: subscriptionPayments.createdAt,
      reviewedAt: subscriptionPayments.reviewedAt,
    })
    .from(subscriptionPayments)
    .where(inArray(subscriptionPayments.subscriptionId, subscriptionIds))
    .orderBy(asc(subscriptionPayments.createdAt));

  for (const { subscriptionId, proofKey, proofContentType, status, ...payment } of rows) {
    const item: PaymentItem = {
      ...payment,
      status: status as PaymentStatus,
      proof: proofKey ? (proofContentType === "application/pdf" ? "pdf" : "image") : null,
    };
    result.set(subscriptionId, [...(result.get(subscriptionId) ?? []), item]);
  }
  return result;
}

// Jumlah tagihan menunggu verifikasi (pita di halaman Company & tab Tagihan).
export async function countClaimedSubscriptions() {
  await io();
  const [row] = await db.select({ total: count() }).from(subscriptions).where(eq(subscriptions.status, "CLAIMED"));
  return row?.total ?? 0;
}

// Bukti transfer + company pemiliknya, untuk route /api/subscription-payments/[id]/proof.
export async function getPaymentProof(paymentId: string) {
  const [row] = await db
    .select({
      companyId: subscriptionPayments.companyId,
      proofKey: subscriptionPayments.proofKey,
      proofContentType: subscriptionPayments.proofContentType,
    })
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.id, paymentId))
    .limit(1);
  return row ?? null;
}
