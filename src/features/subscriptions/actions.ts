// Server Action fitur langganan (BUSINESS-FLOW §17).
//
// - Owner (subscription:view): memilih paket + jumlah pengguna (atau tambah
//   kuota pengguna prorata) lalu "Saya sudah bayar" + bukti → tagihan
//   tercatat (CLAIMED) beserta pembayaran pertama; bila tagihan kurang bayar,
//   bukti berikutnya ditambahkan ke tagihan yang sama. Harga SELALU dihitung
//   ulang di server (pricing.ts), bukan diambil dari browser. Boleh
//   dijalankan saat company terkunci, karena justru dari sinilah Owner
//   memperpanjang. Klaim TIDAK mengubah akses; hanya pembayaran yang diterima
//   sampai lunas yang memperpanjang masa aktif.
// - Superadmin (subscription:manage): memeriksa tiap pembayaran → terima
//   (isi nominal masuk; lunas bila total ≥ harga, selain itu kurang bayar)
//   atau tolak (alasan wajib). Mencatat pembayaran langsung, mengatur
//   komponen harga, harga khusus company, dan Pengaturan platform. Tidak ada tombol
//   batalkan: setiap tagihan adalah klaim dengan bukti. Tindakan Superadmin
//   tidak dicatat ke audit log company (lihat lib/audit.ts).
//
// Perpanjangan dihitung di dalam transaksi dengan baris company dikunci
// (SELECT ... FOR UPDATE), agar dua konfirmasi bersamaan tidak saling menimpa
// subscription_until.

"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { detectReceiptType } from "@/features/settlements/receipt-file";
import { logAudit } from "@/lib/audit";
import { verifyAccount, verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, violatedConstraint } from "@/lib/db";
import {
  companies,
  companyPricing,
  paymentBankAccounts,
  platformSettings,
  subscriptionPayments,
  subscriptions,
} from "@/lib/db/schema";
import { formatRupiah } from "@/lib/format";
import { getPlatformSettings, PLATFORM_SETTINGS_ID, type PlatformSettings } from "@/lib/platform-settings";
import { getClientIp } from "@/lib/request";
import { deleteObject, putObject } from "@/lib/storage";
import { nextPeriod, type CompanyAccess } from "@/lib/subscription-access";
import { sendWhatsApp } from "@/lib/whatsapp";
import type { ActionResult } from "@/types/action-result";
import { OPEN_SUBSCRIPTION_STATUSES, PROOF_MAX_BYTES, QRIS_MAX_BYTES, type PlanMonths } from "./constants";
import { invoiceLabel } from "./labels";
import { notifyOwners } from "./notifications";
import { minPlanUsers, planPrice, topupPrice } from "./pricing";
import { getCompanyPricing } from "./queries";
import {
  acceptPaymentSchema,
  bankAccountSchema,
  claimPaymentSchema,
  companyPricingSchema,
  directPaymentSchema,
  idSchema,
  platformSettingsSchema,
  pricingSchema,
  rejectPaymentSchema,
} from "./schemas";
import { getSeatUsage } from "./seats";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const NOT_FOUND = { success: false, message: "Pembayaran tidak ditemukan atau sudah diperiksa." } as const;
const OPEN_EXISTS = {
  success: false,
  message: "Masih ada tagihan yang belum selesai (menunggu verifikasi / kurang bayar).",
} as const;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getSubscriptionAdmin() {
  const actor = await verifyAccount();
  return can(actor, "subscription:manage") ? actor : null;
}

// ---------------------------------------------------------------------------
// Owner: "Saya sudah bayar" (tagihan baru atau melengkapi kurang bayar)
// ---------------------------------------------------------------------------

export async function claimSubscriptionPaid(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await verifySession({ allowLocked: true });
  if (!can(actor, "subscription:view")) return FORBIDDEN;
  const companyId = actor.company.id;

  const parsed = claimPaymentSchema.safeParse({
    kind: formData.get("kind") || undefined,
    months: formData.get("months") || undefined,
    users: formData.get("users") || undefined,
    subscriptionId: formData.get("subscriptionId") || undefined,
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const upload = formData.get("proof");
  if (!(upload instanceof File) || upload.size === 0) {
    return fieldError("proof", "Unggah bukti transfer (foto/screenshot atau PDF)");
  }
  if (upload.size > PROOF_MAX_BYTES) return fieldError("proof", "Ukuran bukti maksimal 4 MB");
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const type = detectReceiptType(bytes);
  if (!type) return fieldError("proof", "Bukti harus berupa foto (JPG, PNG, WebP) atau PDF");

  // Mode 1: melengkapi tagihan kurang bayar milik company ini.
  // Mode 2: tagihan baru (paket atau tambah kuota), harga dihitung di server.
  let invoice: Invoice & { id: string; isNew: boolean };
  if (parsed.data.subscriptionId) {
    const [open] = await db
      .select({
        id: subscriptions.id,
        kind: subscriptions.kind,
        months: subscriptions.months,
        users: subscriptions.users,
        price: subscriptions.price,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, parsed.data.subscriptionId),
          eq(subscriptions.companyId, companyId),
          eq(subscriptions.status, "UNDERPAID"),
        ),
      )
      .limit(1);
    if (!open) return { success: false, message: "Tagihan kurang bayar tidak ditemukan." };
    invoice = { ...open, isNew: false };
  } else {
    const quote = await quoteNewInvoice(companyId, actor.company.access, parsed.data);
    if (!quote.success) return quote;
    invoice = { id: crypto.randomUUID(), ...quote.data, isNew: true };
  }

  const paymentId = crypto.randomUUID();
  // Diawali id company agar file tiap klien terpisah di storage.
  const proofKey = `${companyId}/subscription-proofs/${paymentId}.${type.extension}`;
  await putObject(proofKey, bytes, type.contentType);

  try {
    await db.transaction(async (tx) => {
      if (invoice.isNew) {
        await tx.insert(subscriptions).values({
          id: invoice.id,
          companyId,
          kind: invoice.kind,
          months: invoice.months,
          users: invoice.users,
          price: invoice.price, // snapshot
          status: "CLAIMED",
          createdById: actor.id,
        });
      } else {
        // Kurang bayar → ada pembayaran baru yang menunggu verifikasi.
        await tx.update(subscriptions).set({ status: "CLAIMED" }).where(eq(subscriptions.id, invoice.id));
      }
      await tx.insert(subscriptionPayments).values({
        id: paymentId,
        subscriptionId: invoice.id,
        companyId,
        status: "PENDING",
        proofKey,
        proofContentType: type.contentType,
        note: parsed.data.note,
        createdById: actor.id,
      });
      await logAudit(
        {
          companyId,
          userId: actor.id,
          action: "SUBSCRIPTION_PAYMENT_CLAIMED",
          entityName: "subscriptions",
          entityId: invoice.id,
          newValues: { plan: invoiceLabel(invoice), amount: invoice.price, note: parsed.data.note },
          ipAddress: await getClientIp(),
        },
        tx,
      );
    });
  } catch (error) {
    await deleteObject(proofKey).catch(() => undefined);
    // Unique index: satu tagihan terbuka per company (dua klik bersamaan).
    if (violatedConstraint(error) === "subscriptions_company_open_unique") return OPEN_EXISTS;
    throw error;
  }

  // Kabari admin ArchiPay; gagal kirim tidak membatalkan klaim.
  const { adminPhone } = await getPlatformSettings();
  if (adminPhone) {
    const text = [
      `${invoice.isNew ? "Klaim pembayaran langganan" : "Bukti pelunasan kurang bayar"} dari ${actor.company.name} (${actor.fullName}).`,
      `${invoiceLabel(invoice)}, tagihan ${formatRupiah(invoice.price)}.`,
      parsed.data.note ? `Catatan: ${parsed.data.note}` : null,
      "Cek mutasi rekening lalu terima/tolak di menu Tagihan.",
    ]
      .filter(Boolean)
      .join("\n");
    after(() => sendWhatsApp({ to: adminPhone, text }));
  }

  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Superadmin: memeriksa pembayaran
// ---------------------------------------------------------------------------

// Terima pembayaran dengan nominal yang benar-benar masuk. Total diterima ≥
// harga → lunas, masa aktif diperpanjang; kurang → UNDERPAID.
export async function acceptPayment(paymentId: string, formData: FormData): Promise<ActionResult> {
  const actor = await getSubscriptionAdmin();
  if (!actor) return FORBIDDEN;

  const id = idSchema.safeParse(paymentId);
  const parsed = acceptPaymentSchema.safeParse({ amount: formData.get("amount") ?? "", note: formData.get("note") ?? "" });
  if (!id.success) return NOT_FOUND;
  if (!parsed.success) return invalid(parsed.error);

  const result = await db.transaction(async (tx) => {
    const payment = await lockPendingPayment(tx, id.data);
    if (!payment) return null;

    const [invoice] = await tx
      .select({
        id: subscriptions.id,
        companyId: subscriptions.companyId,
        kind: subscriptions.kind,
        months: subscriptions.months,
        users: subscriptions.users,
        price: subscriptions.price,
        amountPaid: subscriptions.amountPaid,
      })
      .from(subscriptions)
      .where(
        and(eq(subscriptions.id, payment.subscriptionId), inArray(subscriptions.status, [...OPEN_SUBSCRIPTION_STATUSES])),
      )
      .for("update");
    if (!invoice) return null;

    const now = new Date();
    await tx
      .update(subscriptionPayments)
      .set({
        status: "ACCEPTED",
        amountReceived: parsed.data.amount,
        reviewNote: parsed.data.note,
        reviewedAt: now,
        reviewedById: actor.id,
      })
      .where(eq(subscriptionPayments.id, payment.id));

    const amountPaid = invoice.amountPaid + parsed.data.amount;
    if (amountPaid >= invoice.price) {
      const applied = await applyPaidInvoice(tx, invoice);
      await tx
        .update(subscriptions)
        .set({
          status: "ACTIVE",
          amountPaid,
          startsAt: applied.startsAt,
          endsAt: applied.endsAt,
          paidAt: now,
          confirmedById: actor.id,
        })
        .where(eq(subscriptions.id, invoice.id));
      return { companyId: invoice.companyId, applied, remaining: 0, price: invoice.price };
    }

    await tx.update(subscriptions).set({ status: "UNDERPAID", amountPaid }).where(eq(subscriptions.id, invoice.id));
    return { companyId: invoice.companyId, applied: null, remaining: invoice.price - amountPaid, price: invoice.price };
  });
  if (!result) return NOT_FOUND;

  after(() =>
    notifyOwners(
      result.companyId,
      result.applied
        ? { kind: "paid", until: result.applied.until, userLimit: result.applied.userLimit }
        : { kind: "underpaid", received: parsed.data.amount, remaining: result.remaining, price: result.price },
    ),
  );

  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

// Tolak satu pembayaran (dana tidak masuk / bukti palsu). Tagihan yang belum
// pernah menerima pembayaran → ditolak final (Owner mulai lagi dari pilihan
// paket); bila sudah ada yang diterima → kembali kurang bayar.
export async function rejectPayment(paymentId: string, formData: FormData): Promise<ActionResult> {
  const actor = await getSubscriptionAdmin();
  if (!actor) return FORBIDDEN;

  const id = idSchema.safeParse(paymentId);
  const parsed = rejectPaymentSchema.safeParse({ reason: formData.get("reason") ?? "" });
  if (!id.success) return NOT_FOUND;
  if (!parsed.success) return invalid(parsed.error);
  const { reason } = parsed.data;

  const companyId = await db.transaction(async (tx) => {
    const payment = await lockPendingPayment(tx, id.data);
    if (!payment) return null;

    const [invoice] = await tx
      .select({ id: subscriptions.id, companyId: subscriptions.companyId, amountPaid: subscriptions.amountPaid })
      .from(subscriptions)
      .where(eq(subscriptions.id, payment.subscriptionId))
      .for("update");
    if (!invoice) return null;

    const now = new Date();
    await tx
      .update(subscriptionPayments)
      .set({ status: "REJECTED", reviewNote: reason, reviewedAt: now, reviewedById: actor.id })
      .where(eq(subscriptionPayments.id, payment.id));
    await tx
      .update(subscriptions)
      .set(
        invoice.amountPaid > 0
          ? { status: "UNDERPAID" }
          : { status: "REJECTED", rejectedAt: now, rejectionNote: reason },
      )
      .where(eq(subscriptions.id, invoice.id));
    return invoice.companyId;
  });
  if (!companyId) return NOT_FOUND;

  after(() => notifyOwners(companyId, { kind: "rejected", reason }));

  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

// Superadmin mencatat pembayaran langsung (tunai/transfer saat kunjungan).
// Harga = harga yang berlaku untuk company itu; langsung lunas.
export async function recordDirectPayment(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getSubscriptionAdmin();
  if (!actor) return FORBIDDEN;

  const parsed = directPaymentSchema.safeParse({
    companyId: formData.get("companyId"),
    months: formData.get("months"),
    users: formData.get("users"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { companyId, months, users: userCount, note } = parsed.data;

  const [{ pricing }, seats] = await Promise.all([getCompanyPricing(companyId), getSeatUsage(companyId)]);
  if (pricing.basePrice <= 0) return fieldError("months", "Harga dasar paket belum diatur di Pengaturan platform");
  const minUsers = minPlanUsers(pricing, seats.active);
  if (userCount < minUsers) return fieldError("users", `Minimal ${minUsers} pengguna`);
  const price = planPrice(pricing, months, userCount);

  let applied: Applied;
  try {
    applied = await db.transaction(async (tx) => {
      const result = await applyPaidInvoice(tx, { companyId, kind: "PLAN", months, users: userCount });
      const now = new Date();
      const subscriptionId = crypto.randomUUID();
      await tx.insert(subscriptions).values({
        id: subscriptionId,
        companyId,
        kind: "PLAN",
        months,
        users: userCount,
        price,
        amountPaid: price,
        status: "ACTIVE",
        startsAt: result.startsAt,
        endsAt: result.endsAt,
        paidAt: now,
        note,
        createdById: actor.id,
        confirmedById: actor.id,
      });
      await tx.insert(subscriptionPayments).values({
        subscriptionId,
        companyId,
        status: "ACCEPTED",
        amountReceived: price,
        reviewNote: note,
        reviewedAt: now,
        reviewedById: actor.id,
        createdById: actor.id,
      });
      return result;
    });
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return { success: false, message: "Company tidak ditemukan." };
    throw error;
  }

  after(() => notifyOwners(companyId, { kind: "paid", until: applied.until, userLimit: applied.userLimit }));

  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Komponen harga standar & harga khusus company
// ---------------------------------------------------------------------------

export async function updatePricing(_prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  if (!(await getSubscriptionAdmin())) return FORBIDDEN;

  const parsed = pricingSchema.safeParse({
    basePrice: formData.get("basePrice") ?? "",
    includedUsers: formData.get("includedUsers"),
    extraUserPrice: formData.get("extraUserPrice") ?? "",
    discount6: formData.get("discount6"),
    discount12: formData.get("discount12"),
  });
  if (!parsed.success) return invalid(parsed.error);

  await upsertPlatformSettings(parsed.data);
  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

// Harga khusus satu company. Semua kolom kosong = hapus harga khusus.
export async function saveCompanyPricing(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getSubscriptionAdmin())) return FORBIDDEN;

  const parsed = companyPricingSchema.safeParse({
    companyId: formData.get("companyId"),
    basePrice: formData.get("basePrice") ?? "",
    includedUsers: formData.get("includedUsers") ?? "",
    extraUserPrice: formData.get("extraUserPrice") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const { companyId, ...values } = parsed.data;
  if (values.basePrice == null && values.includedUsers == null && values.extraUserPrice == null) {
    await db.delete(companyPricing).where(eq(companyPricing.companyId, companyId));
  } else {
    await db
      .insert(companyPricing)
      .values({ companyId, ...values })
      .onConflictDoUpdate({ target: companyPricing.companyId, set: values });
  }

  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Pengaturan platform: masa gratis/tenggang, WhatsApp admin, rekening, QRIS
// ---------------------------------------------------------------------------

export async function updatePlatformSettings(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getSubscriptionAdmin())) return FORBIDDEN;

  const parsed = platformSettingsSchema.safeParse({
    freeDays: formData.get("freeDays"),
    graceDays: formData.get("graceDays"),
    trialMaxUsers: formData.get("trialMaxUsers"),
    adminPhone: formData.get("adminPhone") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  await upsertPlatformSettings(parsed.data);

  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

export async function addBankAccount(_prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  if (!(await getSubscriptionAdmin())) return FORBIDDEN;

  const parsed = bankAccountSchema.safeParse({
    bankName: formData.get("bankName") ?? "",
    accountNumber: formData.get("accountNumber") ?? "",
    accountName: formData.get("accountName") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  await db.insert(paymentBankAccounts).values(parsed.data);
  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

export async function deleteBankAccount(id: string): Promise<ActionResult> {
  if (!(await getSubscriptionAdmin())) return FORBIDDEN;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { success: false, message: "Rekening tidak ditemukan." };

  await db.delete(paymentBankAccounts).where(eq(paymentBankAccounts.id, parsed.data));
  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

// Unggah / ganti gambar QRIS statis. File lama dihapus setelah yang baru tersimpan.
export async function uploadQris(_prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  if (!(await getSubscriptionAdmin())) return FORBIDDEN;

  const upload = formData.get("qris");
  if (!(upload instanceof File) || upload.size === 0) return fieldError("qris", "Pilih gambar QRIS");
  if (upload.size > QRIS_MAX_BYTES) return fieldError("qris", "Ukuran gambar maksimal 2 MB");
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const type = detectReceiptType(bytes);
  if (!type || type.contentType === "application/pdf") {
    return fieldError("qris", "QRIS harus berupa gambar (JPG, PNG, WebP)");
  }

  const key = `platform/qris-${crypto.randomUUID()}.${type.extension}`;
  await putObject(key, bytes, type.contentType);
  const previous = await setQrisKey(key);
  if (previous) await deleteObject(previous).catch(() => undefined);

  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

export async function removeQris(): Promise<ActionResult> {
  if (!(await getSubscriptionAdmin())) return FORBIDDEN;
  const previous = await setQrisKey(null);
  if (previous) await deleteObject(previous).catch(() => undefined);
  revalidateSubscriptionPages();
  return { success: true, data: undefined };
}

// Simpan key QRIS baru, kembalikan key lama.
async function setQrisKey(key: string | null) {
  const { qrisImageKey: previous } = await getPlatformSettings();
  await upsertPlatformSettings({ qrisImageKey: key });
  return previous;
}

// Baris platform_settings dibuat saat pertama kali disimpan: kolom yang tidak
// diubah memakai nilai yang berlaku sekarang (atau bawaan).
async function upsertPlatformSettings(values: Partial<PlatformSettings>) {
  const current = await getPlatformSettings();
  await db
    .insert(platformSettings)
    .values({ id: PLATFORM_SETTINGS_ID, ...current, ...values })
    .onConflictDoUpdate({ target: platformSettings.id, set: values });
}

// ---------------------------------------------------------------------------
// Pembantu
// ---------------------------------------------------------------------------

class CompanyNotFoundError extends Error {}

async function lockPendingPayment(tx: Transaction, paymentId: string) {
  const [payment] = await tx
    .select({ id: subscriptionPayments.id, subscriptionId: subscriptionPayments.subscriptionId })
    .from(subscriptionPayments)
    .where(and(eq(subscriptionPayments.id, paymentId), eq(subscriptionPayments.status, "PENDING")))
    .for("update");
  return payment ?? null;
}

type Invoice = { kind: string; months: number | null; users: number; price: number };
type Applied = { startsAt: Date | null; endsAt: Date | null; until: Date; userLimit: number };

// Hitung tagihan baru dari pilihan Owner (harga & syarat dicek di server).
async function quoteNewInvoice(
  companyId: string,
  access: CompanyAccess,
  input: { kind: "PLAN" | "TOPUP"; months?: PlanMonths; users?: number },
): Promise<ActionResult<Invoice>> {
  const [{ pricing }, seats] = await Promise.all([getCompanyPricing(companyId), getSeatUsage(companyId)]);
  if (input.users == null) return fieldError("users", "Isi jumlah pengguna");

  if (input.kind === "TOPUP") {
    // Tambah kuota hanya untuk langganan berbayar yang masih berjalan; masa
    // gratis/tenggang/terkunci membeli paket baru dengan jumlah pengguna baru.
    if (access.status !== "ACTIVE" || access.daysLeft < 1) {
      return { success: false, message: "Tambah kuota hanya untuk langganan aktif. Pilih paket baru." };
    }
    const price = topupPrice(pricing, input.users, access.daysLeft);
    if (price <= 0) return { success: false, message: "Harga pengguna tambahan belum diatur. Hubungi admin ArchiPay." };
    return { success: true, data: { kind: "TOPUP", months: null, users: input.users, price } };
  }

  if (input.months == null) return { success: false, message: "Pilih paket terlebih dahulu." };
  if (pricing.basePrice <= 0) return { success: false, message: "Harga paket belum diatur. Hubungi admin ArchiPay." };
  const minUsers = minPlanUsers(pricing, seats.active);
  if (input.users < minUsers) {
    return fieldError("users", `Minimal ${minUsers} pengguna (pengguna aktif saat ini ${seats.active})`);
  }
  return {
    success: true,
    data: { kind: "PLAN", months: input.months, users: input.users, price: planPrice(pricing, input.months, input.users) },
  };
}

// Terapkan tagihan yang lunas ke company (baris company dikunci):
// - PLAN : masa aktif diperpanjang dari subscription_until yang sedang
//          berjalan, batas pengguna = jumlah pengguna paket.
// - TOPUP: batas pengguna bertambah, masa aktif tetap.
async function applyPaidInvoice(
  tx: Transaction,
  invoice: { companyId: string; kind: string; months: number | null; users: number },
): Promise<Applied> {
  const [company] = await tx
    .select({ subscriptionUntil: companies.subscriptionUntil, userLimit: companies.userLimit })
    .from(companies)
    .where(eq(companies.id, invoice.companyId))
    .for("update");
  if (!company) throw new CompanyNotFoundError();

  if (invoice.kind === "TOPUP" || invoice.months == null) {
    const userLimit = company.userLimit + invoice.users;
    await tx.update(companies).set({ userLimit }).where(eq(companies.id, invoice.companyId));
    return { startsAt: null, endsAt: null, until: company.subscriptionUntil, userLimit };
  }

  const period = nextPeriod(company.subscriptionUntil, invoice.months);
  await tx
    .update(companies)
    .set({ subscriptionUntil: period.endsAt, userLimit: invoice.users })
    .where(eq(companies.id, invoice.companyId));
  return { ...period, until: period.endsAt, userLimit: invoice.users };
}

function invalid(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}

function fieldError(field: string, message: string) {
  return { success: false as const, message: "Periksa kembali isian Anda.", fieldErrors: { [field]: [message] } };
}

// Status langganan tampil di banyak tempat: Langganan (Owner), Company,
// Tagihan, Pengaturan platform, spanduk di layout, dan data user yang di-cache.
function revalidateSubscriptionPages() {
  revalidatePath("/", "layout");
}
