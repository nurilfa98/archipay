// Server Action pertanggungjawaban: tambah/hapus nota, kirim, kembalikan
// untuk diperbaiki, verifikasi, serta pencatatan pengembalian sisa dana &
// pembayaran penggantian.
//
// Draf laporan dibuat otomatis saat karyawan mengonfirmasi terima dana
// (features/advances/actions.ts → acknowledgeAdvance), jadi setiap uang muka
// yang sudah diterima selalu punya tepat satu laporan.
//
// Pola sama dengan features/advances/actions.ts:
// 1. Setiap action mengecek login & hak akses sendiri.
// 2. Aturan "siapa boleh apa" dari service.ts (getSettlementActions).
// 3. Status uang muka diubah dengan UPDATE ... WHERE status = <status lama>
//    (atau dikunci dengan SELECT ... FOR UPDATE), sehingga dua aksi yang
//    bersamaan tidak saling menimpa.
// 4. Perubahan + ledger + audit log dalam satu transaksi.
// 5. WhatsApp dikirim di after(), setelah respons terkirim.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md
// - https://orm.drizzle.team/docs/select#lock-for-update (SELECT ... FOR UPDATE)

"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getActiveRecipient, getOwnerContacts } from "@/features/advances/queries";
import { getCompanySettings } from "@/features/settings/queries";
import { logAudit } from "@/lib/audit";
import { verifySession, type CurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { endOfDayAfter, formatDateOnly, zonedDateString } from "@/lib/dates";
import { db, isUniqueViolation } from "@/lib/db";
import {
  advanceLedgerEntries,
  advanceRequests,
  expenseCategories,
  settlementItems,
  settlements,
} from "@/lib/db/schema";
import { nextDocumentNumber } from "@/lib/document-number";
import { formatRupiah } from "@/lib/format";
import { getClientIp } from "@/lib/request";
import { deleteObject, putObject } from "@/lib/storage";
import type { ActionResult } from "@/types/action-result";
import {
  EDITABLE_ADVANCE_STATUSES,
  MAX_ITEMS_PER_SETTLEMENT,
  MAX_RECEIPT_BYTES,
  SETTLEMENT_NUMBER_PREFIX,
} from "./constants";
import { postBalanceEntry } from "./ledger";
import {
  notifyBalanceRecorded,
  notifyRevisionRequested,
  notifySubmitted,
  notifyVerified,
} from "./notifications";
import { getSettlementDetail, listSettlementItems, type SettlementDetail } from "./queries";
import { detectReceiptType, hashFile } from "./receipt-file";
import {
  balancePaymentSchema,
  revisionNoteSchema,
  settlementIdSchema,
  settlementItemSchema,
  verificationSchema,
  type VerificationDecision,
} from "./schemas";
import { getSettlementActions, settlementOutcome } from "./service";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses untuk tindakan ini." } as const;
const NOT_FOUND = { success: false, message: "Pertanggungjawaban tidak ditemukan." } as const;
const STALE = {
  success: false,
  message: "Status pertanggungjawaban sudah berubah. Muat ulang halaman untuk melihat data terbaru.",
} as const;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Tambah nota (karyawan, selama draf / perlu diperbaiki)
// ---------------------------------------------------------------------------

export async function addSettlementItem(settlementId: string, formData: FormData): Promise<ActionResult> {
  const loaded = await loadSettlement(settlementId);
  if (!loaded.success) return loaded;
  const { actor, settlement } = loaded.data;

  const itemCount = (await listSettlementItems(settlement.id)).length;
  if (!getSettlementActions({ ...settlement, itemCount }, actor).edit) return FORBIDDEN;
  if (itemCount >= MAX_ITEMS_PER_SETTLEMENT) {
    return { success: false, message: `Maksimal ${MAX_ITEMS_PER_SETTLEMENT} nota per pertanggungjawaban.` };
  }

  const parsed = settlementItemSchema.safeParse({
    receiptDate: formData.get("receiptDate") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    description: formData.get("description") ?? "",
    amount: formData.get("amount") ?? "",
    noReceipt: formData.get("noReceipt"),
    noReceiptReason: formData.get("noReceiptReason") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  const [category] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.id, input.categoryId), eq(expenseCategories.isActive, true)))
    .limit(1);
  if (!category) return fieldError("categoryId", "Kategori tidak ditemukan");

  // Tanggal nota: antara hari dana dicairkan dan hari ini (zona waktu perusahaan).
  const earliest = zonedDateString(settlement.disbursedAt!);
  if (input.receiptDate < earliest) {
    return fieldError("receiptDate", `Tanggal nota tidak boleh sebelum dana dicairkan (${formatDateOnly(earliest)})`);
  }
  if (input.receiptDate > zonedDateString(new Date())) {
    return fieldError("receiptDate", "Tanggal nota tidak boleh setelah hari ini");
  }

  let file: { bytes: Uint8Array<ArrayBuffer>; hash: string; contentType: string; extension: string } | null = null;
  if (input.noReceipt) {
    const { noReceiptMaxAmount } = await getCompanySettings();
    if (input.amount > noReceiptMaxAmount) {
      return fieldError("amount", `Biaya tanpa nota maksimal ${formatRupiah(noReceiptMaxAmount)} per item`);
    }
  } else {
    const upload = formData.get("file");
    if (!(upload instanceof File) || upload.size === 0) return fieldError("file", "Lampirkan foto atau PDF nota");
    if (upload.size > MAX_RECEIPT_BYTES) return fieldError("file", "Ukuran file maksimal 4 MB");

    const bytes = new Uint8Array(await upload.arrayBuffer());
    const type = detectReceiptType(bytes);
    if (!type) return fieldError("file", "File harus berupa foto (JPG, PNG, WebP) atau PDF");

    const hash = hashFile(bytes);
    const duplicate = await findReceiptByHash(hash);
    if (duplicate) return fieldError("file", duplicateMessage(duplicate));
    file = { bytes, hash, ...type };
  }

  const itemId = crypto.randomUUID();
  const fileKey = file ? `receipts/${settlement.advanceId}/${itemId}.${file.extension}` : null;
  // File diunggah SEBELUM baris disimpan. Bila penyimpanan gagal, file
  // dihapus lagi agar tidak ada file yatim di storage.
  if (file && fileKey) {
    try {
      await putObject(fileKey, file.bytes, file.contentType);
    } catch (error) {
      console.error("[settlements] upload gagal:", error);
      return { success: false, message: "Gagal mengunggah file nota. Coba lagi beberapa saat." };
    }
  }

  const ip = await getClientIp();
  try {
    const saved = await db.transaction(async (tx) => {
      if (!(await lockEditable(tx, settlement.advanceId))) return false;
      await tx.insert(settlementItems).values({
        id: itemId,
        settlementId: settlement.id,
        receiptDate: input.receiptDate,
        categoryId: input.categoryId,
        description: input.description,
        amount: input.amount,
        hasReceipt: !input.noReceipt,
        noReceiptReason: input.noReceipt ? input.noReceiptReason : null,
        fileKey,
        fileHash: file?.hash ?? null,
        fileContentType: file?.contentType ?? null,
        fileSize: file?.bytes.byteLength ?? null,
      });
      await logAudit(
        {
          userId: actor.id,
          action: "SETTLEMENT_ITEM_ADDED",
          entityName: "settlements",
          entityId: settlement.id,
          newValues: { itemId, ...input, fileHash: file?.hash ?? null },
          ipAddress: ip,
        },
        tx,
      );
      return true;
    });
    if (!saved) {
      if (fileKey) await deleteObject(fileKey).catch(() => {});
      return STALE;
    }
  } catch (error) {
    if (fileKey) await deleteObject(fileKey).catch(() => {});
    // Dua unggahan file yang sama bersamaan: ditolak unique index file_hash.
    if (isUniqueViolation(error)) return fieldError("file", "Nota ini sudah pernah diunggah");
    throw error;
  }

  revalidateSettlements();
  return done();
}

// ---------------------------------------------------------------------------
// Hapus nota (karyawan, selama draf / perlu diperbaiki)
// ---------------------------------------------------------------------------

export async function removeSettlementItem(settlementId: string, itemId: string): Promise<ActionResult> {
  const loaded = await loadSettlement(settlementId);
  if (!loaded.success) return loaded;
  const { actor, settlement } = loaded.data;
  if (!getSettlementActions({ ...settlement, itemCount: 0 }, actor).edit) return FORBIDDEN;

  const id = z.string().min(1).max(36).safeParse(itemId);
  if (!id.success) return NOT_FOUND;

  const ip = await getClientIp();
  const removed = await db.transaction(async (tx) => {
    if (!(await lockEditable(tx, settlement.advanceId))) return null;
    const [row] = await tx
      .delete(settlementItems)
      .where(and(eq(settlementItems.id, id.data), eq(settlementItems.settlementId, settlement.id)))
      .returning({
        fileKey: settlementItems.fileKey,
        description: settlementItems.description,
        amount: settlementItems.amount,
      });
    if (!row) return null;
    await logAudit(
      {
        userId: actor.id,
        action: "SETTLEMENT_ITEM_REMOVED",
        entityName: "settlements",
        entityId: settlement.id,
        oldValues: { itemId: id.data, description: row.description, amount: row.amount },
        ipAddress: ip,
      },
      tx,
    );
    return row;
  });
  if (!removed) return STALE;

  // File dihapus setelah baris terhapus; gagal hapus file tidak mengganggu user.
  const fileKey = removed.fileKey;
  if (fileKey) after(() => deleteObject(fileKey).catch((error) => console.error("[settlements] hapus file:", error)));
  revalidateSettlements();
  return done();
}

// ---------------------------------------------------------------------------
// Kirim laporan (karyawan)
// ---------------------------------------------------------------------------

// Nomor PJ diberikan saat pengiriman PERTAMA. Setelah dikirim, nota terkunci.
export async function submitSettlement(settlementId: string): Promise<ActionResult> {
  const loaded = await loadSettlement(settlementId);
  if (!loaded.success) return loaded;
  const { actor, settlement } = loaded.data;

  const items = await listSettlementItems(settlement.id);
  if (!getSettlementActions({ ...settlement, itemCount: items.length }, actor).submit) {
    return items.length === 0 ? { success: false, message: "Tambahkan minimal satu nota." } : FORBIDDEN;
  }

  const submittedAt = new Date();
  const ip = await getClientIp();
  const number = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(advanceRequests)
      .set({ status: "SUBMITTED" })
      .where(
        and(
          eq(advanceRequests.id, settlement.advanceId),
          inArray(advanceRequests.status, [...EDITABLE_ADVANCE_STATUSES]),
        ),
      )
      .returning({ id: advanceRequests.id });
    if (!updated) return null;

    const documentNumber = settlement.number
      ? null
      : await nextDocumentNumber(tx, SETTLEMENT_NUMBER_PREFIX, submittedAt);
    await tx
      .update(settlements)
      .set({ ...documentNumber, submittedAt, revisionNote: null })
      .where(eq(settlements.id, settlement.id));

    await logAudit(
      {
        userId: actor.id,
        action: "SETTLEMENT_SUBMITTED",
        entityName: "settlements",
        entityId: settlement.id,
        oldValues: { status: settlement.advanceStatus },
        newValues: {
          status: "SUBMITTED",
          number: documentNumber?.number ?? settlement.number,
          itemCount: items.length,
          itemTotal: sum(items),
        },
        ipAddress: ip,
      },
      tx,
    );
    return documentNumber?.number ?? settlement.number!;
  });
  if (!number) return STALE;

  const late = !!settlement.settlementDueAt && submittedAt > settlement.settlementDueAt;
  after(async () => {
    const contacts = await getOwnerContacts([settlement.disbursedById]);
    await notifySubmitted(
      { id: settlement.id, number, advanceNumber: settlement.advanceNumber, itemTotal: sum(items), itemCount: items.length, late },
      settlement.recipientName,
      // Penerima tidak perlu diberi tahu tentang laporannya sendiri.
      contacts.filter((contact) => contact.id !== settlement.recipientId),
    );
  });
  revalidateSettlements();
  return done();
}

// ---------------------------------------------------------------------------
// Kembalikan untuk diperbaiki (OWNER/FINANCE)
// ---------------------------------------------------------------------------

export async function requestSettlementRevision(settlementId: string, note: string): Promise<ActionResult> {
  const loaded = await loadSettlement(settlementId);
  if (!loaded.success) return loaded;
  const { actor, settlement } = loaded.data;
  if (!getSettlementActions({ ...settlement, itemCount: 0 }, actor).requestRevision) return FORBIDDEN;

  const parsedNote = revisionNoteSchema.safeParse(note);
  if (!parsedNote.success) {
    return fieldError("reason", z.flattenError(parsedNote.error).formErrors[0] ?? "Catatan tidak valid");
  }

  const ip = await getClientIp();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(advanceRequests)
      .set({ status: "REVISION_REQUESTED" })
      .where(and(eq(advanceRequests.id, settlement.advanceId), eq(advanceRequests.status, "SUBMITTED")))
      .returning({ id: advanceRequests.id });
    if (!row) return false;

    await tx
      .update(settlements)
      .set({ revisionNote: parsedNote.data, revisionRequestedById: actor.id, revisionRequestedAt: new Date() })
      .where(eq(settlements.id, settlement.id));
    await logAudit(
      {
        userId: actor.id,
        action: "SETTLEMENT_REVISION_REQUESTED",
        entityName: "settlements",
        entityId: settlement.id,
        newValues: { status: "REVISION_REQUESTED", note: parsedNote.data },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!updated) return STALE;

  const recipient = await getActiveRecipient(settlement.recipientId);
  if (recipient && settlement.number) {
    const summary = { id: settlement.id, number: settlement.number, advanceNumber: settlement.advanceNumber };
    after(() => notifyRevisionRequested(summary, recipient, parsedNote.data));
  }
  revalidateSettlements();
  return done();
}

// ---------------------------------------------------------------------------
// Verifikasi (OWNER/FINANCE): setujui / tolak per nota, lalu saldo dihitung
// ---------------------------------------------------------------------------

// Nota yang ditolak bersifat final: nominalnya tidak mengurangi saldo,
// sehingga otomatis menjadi bagian sisa yang harus dikembalikan karyawan.
export async function verifySettlement(
  settlementId: string,
  decisions: VerificationDecision[],
): Promise<ActionResult> {
  const loaded = await loadSettlement(settlementId);
  if (!loaded.success) return loaded;
  const { actor, settlement } = loaded.data;
  if (!getSettlementActions({ ...settlement, itemCount: 0 }, actor).verify) return FORBIDDEN;

  const parsed = verificationSchema.safeParse(decisions);
  if (!parsed.success) {
    // Error per nota dikirim sebagai fieldErrors["reason:<itemId>"].
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const index = issue.path[0];
      const itemId = typeof index === "number" ? decisions[index]?.itemId : undefined;
      if (itemId) fieldErrors[`reason:${itemId}`] = [issue.message];
    }
    return { success: false, message: "Lengkapi alasan untuk nota yang ditolak.", fieldErrors };
  }

  const items = await listSettlementItems(settlement.id);
  const byId = new Map(parsed.data.map((decision) => [decision.itemId, decision]));
  if (byId.size !== items.length || items.some((item) => !byId.has(item.id))) {
    return { success: false, message: "Setiap nota harus disetujui atau ditolak." };
  }

  const approved = items.filter((item) => byId.get(item.id)!.approved);
  const approvedAmount = sum(approved);
  const verifiedAt = new Date();
  const { returnDueDays: defaultReturnDays } = await getCompanySettings();
  const ip = await getClientIp();

  const result = await db.transaction(async (tx) => {
    // Kunci baris uang muka: hanya satu verifikator yang bisa menyelesaikan.
    const [locked] = await tx
      .select({ status: advanceRequests.status })
      .from(advanceRequests)
      .where(eq(advanceRequests.id, settlement.advanceId))
      .for("update");
    if (locked?.status !== "SUBMITTED") return null;

    for (const item of items) {
      const decision = byId.get(item.id)!;
      await tx
        .update(settlementItems)
        .set({
          verificationStatus: decision.approved ? "APPROVED" : "REJECTED",
          rejectionReason: decision.approved ? null : decision.reason!,
        })
        .where(and(eq(settlementItems.id, item.id), eq(settlementItems.settlementId, settlement.id)));
    }

    if (approved.length > 0) {
      await tx.insert(advanceLedgerEntries).values(
        approved.map((item) => ({
          advanceId: settlement.advanceId,
          type: "EXPENSE_APPROVED",
          amount: -item.amount,
          settlementItemId: item.id,
          note: `${item.categoryName}: ${item.description}`.slice(0, 300),
          createdById: actor.id,
        })),
      );
    }

    // Saldo SELALU dihitung dari ledger, bukan dari angka di form.
    const [{ balance }] = await tx
      .select({ balance: sql`coalesce(sum(${advanceLedgerEntries.amount}), 0)`.mapWith(Number) })
      .from(advanceLedgerEntries)
      .where(eq(advanceLedgerEntries.advanceId, settlement.advanceId));
    const outcome = settlementOutcome(balance);
    const returnDueAt =
      balance > 0 ? endOfDayAfter(verifiedAt, settlement.returnDueDays ?? defaultReturnDays) : null;

    await tx.update(advanceRequests).set({ status: outcome }).where(eq(advanceRequests.id, settlement.advanceId));
    await tx
      .update(settlements)
      .set({
        verifiedById: actor.id,
        verifiedAt,
        approvedAmount,
        balanceAmount: balance,
        returnDueAt,
        revisionNote: null,
      })
      .where(eq(settlements.id, settlement.id));

    await logAudit(
      {
        userId: actor.id,
        action: "SETTLEMENT_VERIFIED",
        entityName: "settlements",
        entityId: settlement.id,
        newValues: {
          status: outcome,
          approvedAmount,
          balance,
          rejectedItems: items.filter((item) => !byId.get(item.id)!.approved).map((item) => item.id),
        },
        ipAddress: ip,
      },
      tx,
    );
    return { balance, returnDueAt };
  });
  if (!result) return STALE;

  const recipient = await getActiveRecipient(settlement.recipientId);
  if (recipient && settlement.number) {
    const summary = {
      id: settlement.id,
      number: settlement.number,
      advanceNumber: settlement.advanceNumber,
      approvedAmount,
      ...result,
    };
    after(() => notifyVerified(summary, recipient));
  }
  revalidateSettlements();
  return done();
}

// ---------------------------------------------------------------------------
// Pengembalian sisa dana & pembayaran penggantian (OWNER/FINANCE)
// ---------------------------------------------------------------------------

// Dicatat oleh OWNER/FINANCE saat uang benar-benar diterima / dibayarkan.
// Boleh dicicil; saldo 0 → uang muka selesai (CLOSED).
export async function recordReturn(settlementId: string, formData: FormData): Promise<ActionResult> {
  return recordBalancePayment(settlementId, formData, "RETURN");
}

export async function recordReimbursement(settlementId: string, formData: FormData): Promise<ActionResult> {
  return recordBalancePayment(settlementId, formData, "REIMBURSEMENT");
}

async function recordBalancePayment(
  settlementId: string,
  formData: FormData,
  type: "RETURN" | "REIMBURSEMENT",
): Promise<ActionResult> {
  const loaded = await loadSettlement(settlementId);
  if (!loaded.success) return loaded;
  const { actor, settlement } = loaded.data;
  const actions = getSettlementActions({ ...settlement, itemCount: 0 }, actor);
  if (type === "RETURN" ? !actions.recordReturn : !actions.recordReimbursement) return FORBIDDEN;

  const parsed = balancePaymentSchema.safeParse({
    amount: formData.get("amount") ?? "",
    method: formData.get("method") ?? "",
    reference: formData.get("reference") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  const result = await postBalanceEntry({
    actor,
    advanceId: settlement.advanceId,
    settlementId: settlement.id,
    type,
    amount: input.amount,
    method: input.method,
    reference: input.method === "TRANSFER" ? input.reference : null,
    note: input.note,
    audit: type === "RETURN" ? "SETTLEMENT_RETURN_RECORDED" : "SETTLEMENT_REIMBURSEMENT_RECORDED",
  });
  if (!result.ok) {
    return result.reason === "EXCEEDS"
      ? fieldError("amount", `Nominal melebihi sisa saldo ${formatRupiah(result.outstanding)}`)
      : STALE;
  }

  const recipient = await getActiveRecipient(settlement.recipientId);
  if (recipient && settlement.number) {
    const summary = { id: settlement.id, number: settlement.number, advanceNumber: settlement.advanceNumber };
    after(() => notifyBalanceRecorded(summary, recipient, { type, ...result }));
  }
  revalidateSettlements();
  return done();
}

// ---------------------------------------------------------------------------
// Helper (tanpa export → bukan Server Action, tidak bisa dipanggil dari browser)
// ---------------------------------------------------------------------------

type Loaded = { actor: CurrentUser; settlement: SettlementDetail };

// Hanya penerima atau pemegang advance:view-all yang boleh menyentuh data ini.
// Selain itu dijawab "tidak ditemukan" agar keberadaan datanya tidak bocor.
async function loadSettlement(settlementId: string): Promise<ActionResult<Loaded>> {
  const actor = await verifySession();
  const id = settlementIdSchema.safeParse(settlementId);
  if (!id.success) return NOT_FOUND;

  const settlement = await getSettlementDetail(id.data);
  if (!settlement) return NOT_FOUND;
  if (settlement.recipientId !== actor.id && !can(actor, "advance:view-all")) return NOT_FOUND;
  return { success: true, data: { actor, settlement } };
}

// Mengunci baris uang muka selama transaksi dan memastikan laporan masih
// boleh diubah. Mencegah nota ditambah/dihapus tepat saat laporan dikirim.
async function lockEditable(tx: Transaction, advanceId: string) {
  const [row] = await tx
    .select({ status: advanceRequests.status })
    .from(advanceRequests)
    .where(eq(advanceRequests.id, advanceId))
    .for("update");
  return !!row && (EDITABLE_ADVANCE_STATUSES as readonly string[]).includes(row.status);
}

async function findReceiptByHash(hash: string) {
  const [row] = await db
    .select({ number: settlements.number, advanceNumber: advanceRequests.number })
    .from(settlementItems)
    .innerJoin(settlements, eq(settlementItems.settlementId, settlements.id))
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .where(eq(settlementItems.fileHash, hash))
    .limit(1);
  return row ?? null;
}

function duplicateMessage(duplicate: { number: string | null; advanceNumber: string }) {
  return `Nota ini sudah pernah diunggah (${duplicate.number ?? `draf uang muka ${duplicate.advanceNumber}`})`;
}

function sum(items: { amount: number }[]) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function done(): ActionResult {
  return { success: true, data: undefined };
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

// Status uang muka ikut berubah, jadi halaman uang muka, potong gaji, &
// beranda juga dimuat ulang.
function revalidateSettlements() {
  revalidatePath("/settlements", "layout");
  revalidatePath("/advances", "layout");
  revalidatePath("/payroll-deductions");
  revalidatePath("/");
}
