// Server Action uang muka: pencairan (push), pengajuan karyawan (pull),
// persetujuan, dan konfirmasi terima.
//
// Setiap action:
// 1. Mengecek login & hak akses sendiri (Server Action bisa dipanggil lewat
//    POST tanpa membuka halamannya).
// 2. Memakai aturan dari service.ts (getAvailableActions), sama persis dengan
//    yang dipakai halaman untuk menampilkan tombol.
// 3. Mengubah status dengan UPDATE ... WHERE status = <status lama>. Bila dua
//    orang menekan tombol bersamaan (misal OWNER membatalkan saat karyawan
//    mengonfirmasi), hanya satu yang berhasil; yang lain mendapat pesan
//    "status sudah berubah".
// 4. Menyimpan perubahan + audit log (+ ledger) dalam satu transaksi.
// 5. Mengirim WhatsApp di after(), setelah respons terkirim.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md

"use server";

import { and, eq, isNull, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { logAudit, type AuditAction } from "@/lib/audit";
import { verifySession, type CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { endOfDayAfter, formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { advanceLedgerEntries, advanceRequests, settlements } from "@/lib/db/schema";
import { nextDocumentNumber } from "@/lib/document-number";
import { formatRupiah } from "@/lib/format";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { getActiveProject } from "@/features/projects/queries";
import { getCompanySettings } from "@/features/settings/queries";
import { ADVANCE_NUMBER_PREFIX, type AdvanceStatus, type DisbursementMethod } from "./constants";
import {
  notifyAcknowledged,
  notifyApprovalRequested,
  notifyCancelled,
  notifyDisbursed,
  notifyDisputed,
  notifyRejected,
} from "./notifications";
import {
  countOverdueAdvances,
  getActiveRecipient,
  getAdvanceDetail,
  getOwnerContacts,
  listApprovers,
  type AdvanceDetail,
  type RecipientOption,
} from "./queries";
import {
  advanceIdSchema,
  createAdvanceSchema,
  reasonSchema,
  transferReferenceSchema,
} from "./schemas";
import { buildAcknowledgmentText, eligibleApprovers, getAvailableActions } from "./service";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses untuk tindakan ini." } as const;
const NOT_FOUND = { success: false, message: "Uang muka tidak ditemukan." } as const;
const STALE = {
  success: false,
  message: "Status uang muka sudah berubah. Muat ulang halaman untuk melihat data terbaru.",
} as const;

// ---------------------------------------------------------------------------
// Buat uang muka: push (OWNER/FINANCE) atau pengajuan sendiri (karyawan)
// ---------------------------------------------------------------------------

// Field tersembunyi `kind` menentukan jenisnya:
// - "push" + OWNER (advance:disburse)  → langsung DISBURSED.
// - "push" + FINANCE (advance:propose) → PENDING_APPROVAL, menunggu OWNER.
// - "request" (advance:request)        → PENDING_APPROVAL; penerimanya SELALU
//   user yang login, apa pun yang dikirim browser.
// PENDING_APPROVAL hanya dibuat bila ada penyetuju sah (eligibleApprovers),
// lalu penyetuju tersebut diberi tahu lewat WhatsApp.
// Berhasil → pindah ke halaman detail uang muka yang baru dibuat.
export async function createAdvance(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await verifySession();
  const companyId = actor.company.id;
  const isRequest = formData.get("kind") === "request";
  const direct = !isRequest && can(actor, "advance:disburse");
  const allowed = isRequest
    ? can(actor, "advance:request")
    : direct || can(actor, "advance:propose");
  if (!allowed) return FORBIDDEN;

  const parsed = createAdvanceSchema.safeParse({
    projectId: formData.get("projectId") ?? "",
    recipientId: isRequest ? actor.id : (formData.get("recipientId") ?? ""),
    amount: formData.get("amount") ?? "",
    purpose: formData.get("purpose") ?? "",
    disbursementMethod: formData.get("disbursementMethod") ?? "",
    // Referensi transfer baru ada setelah uang benar-benar ditransfer,
    // jadi untuk usulan FINANCE diisi saat "Catat pencairan".
    transferReference: (direct && formData.get("transferReference")) || "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  // Uang muka baru wajib masuk ke project yang masih aktif.
  const project = await getActiveProject(companyId, input.projectId);
  if (!project) {
    return { success: false, message: "Project tidak ditemukan atau sudah selesai. Pilih project lagi di halaman Uang Muka." };
  }

  if (!isRequest && input.recipientId === actor.id) {
    return fieldError("recipientId", "Pemberi dan penerima dana harus orang berbeda");
  }
  const recipient = await getActiveRecipient(companyId, input.recipientId);
  if (!recipient) return fieldError("recipientId", "Karyawan tidak ditemukan atau sudah nonaktif");

  // Karyawan yang masih punya uang muka tertunda (lewat batas unggah nota, belum
  // dipertanggungjawabkan) sampai batas di Pengaturan tidak boleh menerima uang muka baru.
  const { maxOverdueAdvances } = await getCompanySettings(companyId);
  const overdue = (await countOverdueAdvances(companyId, [recipient.id]))[recipient.id] ?? 0;
  if (overdue >= maxOverdueAdvances) {
    return isRequest
      ? { success: false, message: overdueMessage(overdue, maxOverdueAdvances, true) }
      : fieldError("recipientId", overdueMessage(overdue, maxOverdueAdvances, false, recipient.fullName));
  }

  // Tanpa penyetuju sah, pengajuan/usulan akan menunggu selamanya (misal
  // FINANCE mengusulkan untuk satu-satunya OWNER).
  const approvers = direct
    ? []
    : eligibleApprovers(await listApprovers(companyId), { recipientId: recipient.id, createdById: actor.id });
  if (!direct && approvers.length === 0) {
    return isRequest
      ? { success: false, message: "Belum ada Owner yang dapat menyetujui pengajuan Anda. Silakan hubungi Owner." }
      : fieldError("recipientId", `Tidak ada Owner lain yang dapat menyetujui uang muka untuk ${recipient.fullName}`);
  }

  const disbursement = direct
    ? await buildDisbursement(actor, input.disbursementMethod, input.transferReference, recipient)
    : null;
  const status: AdvanceStatus = direct ? "DISBURSED" : "PENDING_APPROVAL";
  const ip = await getClientIp();

  const createdAt = new Date();
  const created = await db.transaction(async (tx) => {
    // Nomor "UM-2026-10-0001" diambil di transaksi yang sama dengan INSERT.
    const documentNumber = await nextDocumentNumber(tx, companyId, ADVANCE_NUMBER_PREFIX, createdAt);
    const [row] = await tx
      .insert(advanceRequests)
      .values({
        ...documentNumber,
        companyId,
        createdAt,
        projectId: project.id,
        recipientId: recipient.id,
        amount: input.amount,
        purpose: input.purpose,
        disbursementMethod: input.disbursementMethod,
        status,
        createdById: actor.id,
        ...disbursement,
      })
      .returning({ id: advanceRequests.id, number: advanceRequests.number });

    await logAudit(
      {
        companyId,
        userId: actor.id,
        action: direct ? "ADVANCE_DISBURSED" : isRequest ? "ADVANCE_REQUESTED" : "ADVANCE_PROPOSED",
        entityName: "advance_requests",
        entityId: row.id,
        newValues: { ...input, ...disbursement, status, recipientName: recipient.fullName, projectName: project.name },
        ipAddress: ip,
      },
      tx,
    );
    return row;
  });

  if (disbursement) {
    after(() =>
      notifyDisbursed(
        { ...input, ...created, settlementDueAt: disbursement.settlementDueAt },
        recipient,
      ),
    );
  } else {
    after(() =>
      notifyApprovalRequested(
        { ...input, ...created },
        { recipientName: recipient.fullName, creatorName: actor.fullName, isOwnRequest: isRequest },
        approvers,
      ),
    );
  }

  revalidateAdvances();
  redirect(`/advances/${created.id}`);
}

// ---------------------------------------------------------------------------
// Setujui / tolak pengajuan karyawan & usulan FINANCE (OWNER)
// ---------------------------------------------------------------------------

export async function approveAdvance(advanceId: string): Promise<ActionResult> {
  const loaded = await loadAdvance(advanceId);
  if (!loaded.success) return loaded;
  const { actor, advance } = loaded.data;
  if (!getAvailableActions(advance, actor).decide) return FORBIDDEN;

  const updated = await applyTransition(actor, advance, "PENDING_APPROVAL", {
    values: { status: "APPROVED", decidedById: actor.id, decidedAt: new Date() },
    audit: { action: "ADVANCE_APPROVED", newValues: { status: "APPROVED" } },
  });
  return updated ? done() : STALE;
}

export async function rejectAdvance(advanceId: string, reason: string): Promise<ActionResult> {
  const loaded = await loadAdvance(advanceId);
  if (!loaded.success) return loaded;
  const { actor, advance } = loaded.data;
  if (!getAvailableActions(advance, actor).decide) return FORBIDDEN;

  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return reasonError(parsedReason.error);

  const updated = await applyTransition(actor, advance, "PENDING_APPROVAL", {
    values: {
      status: "REJECTED",
      decidedById: actor.id,
      decidedAt: new Date(),
      rejectionReason: parsedReason.data,
    },
    audit: {
      action: "ADVANCE_REJECTED",
      newValues: { status: "REJECTED", reason: parsedReason.data },
    },
  });
  if (!updated) return STALE;

  const creator = await getActiveRecipient(actor.company.id, advance.createdById);
  if (creator) {
    const isOwnRequest = advance.createdById === advance.recipientId;
    after(() => notifyRejected(advance, creator, isOwnRequest, actor.fullName, parsedReason.data));
  }
  return done();
}

// ---------------------------------------------------------------------------
// Catat pencairan atas usulan yang sudah disetujui
// ---------------------------------------------------------------------------

export async function disburseApprovedAdvance(
  advanceId: string,
  transferReference: string,
): Promise<ActionResult> {
  const loaded = await loadAdvance(advanceId);
  if (!loaded.success) return loaded;
  const { actor, advance } = loaded.data;
  if (!getAvailableActions(advance, actor).disburse) return FORBIDDEN;

  const reference = transferReferenceSchema.safeParse(transferReference);
  if (!reference.success) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: { transferReference: z.flattenError(reference.error).formErrors },
    };
  }

  const recipient = await getActiveRecipient(actor.company.id, advance.recipientId);
  if (!recipient) {
    return { success: false, message: "Akun penerima sudah nonaktif. Batalkan uang muka ini." };
  }

  const disbursement = await buildDisbursement(
    actor,
    advance.disbursementMethod,
    reference.data,
    recipient,
  );
  const updated = await applyTransition(actor, advance, "APPROVED", {
    values: { status: "DISBURSED", ...disbursement },
    audit: { action: "ADVANCE_DISBURSED", newValues: { status: "DISBURSED", ...disbursement } },
  });
  if (!updated) return STALE;

  after(() => notifyDisbursed({ ...advance, settlementDueAt: disbursement.settlementDueAt }, recipient));
  return done();
}

// ---------------------------------------------------------------------------
// Batalkan (sebelum dikonfirmasi karyawan)
// ---------------------------------------------------------------------------

export async function cancelAdvance(advanceId: string, reason: string): Promise<ActionResult> {
  const loaded = await loadAdvance(advanceId);
  if (!loaded.success) return loaded;
  const { actor, advance } = loaded.data;
  if (!getAvailableActions(advance, actor).cancel) return FORBIDDEN;

  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return reasonError(parsedReason.error);

  const updated = await applyTransition(actor, advance, advance.status, {
    values: {
      status: "CANCELLED",
      cancelledById: actor.id,
      cancelledAt: new Date(),
      cancellationReason: parsedReason.data,
    },
    audit: {
      action: "ADVANCE_CANCELLED",
      oldValues: { status: advance.status },
      newValues: { status: "CANCELLED", reason: parsedReason.data },
    },
  });
  if (!updated) return STALE;

  // Karyawan hanya perlu tahu bila sebelumnya sudah diberi tahu dana cair.
  if (advance.status === "DISBURSED") {
    const recipient = await getActiveRecipient(actor.company.id, advance.recipientId);
    if (recipient) after(() => notifyCancelled(advance, recipient, parsedReason.data));
  }
  return done();
}

// ---------------------------------------------------------------------------
// Konfirmasi terima + persetujuan potong gaji (karyawan penerima)
// ---------------------------------------------------------------------------

export async function acknowledgeAdvance(advanceId: string, consent: boolean): Promise<ActionResult> {
  const loaded = await loadAdvance(advanceId);
  if (!loaded.success) return loaded;
  const { actor, advance } = loaded.data;
  if (!getAvailableActions(advance, actor).acknowledge) return FORBIDDEN;

  if (consent !== true) {
    return {
      success: false,
      message: "Centang pernyataan persetujuan terlebih dahulu.",
      fieldErrors: { consent: ["Wajib disetujui untuk mengonfirmasi penerimaan dana"] },
    };
  }

  // Teks dibuat ulang di server dari data database (bukan dikirim browser),
  // dengan fungsi yang sama seperti yang ditampilkan di halaman.
  const acknowledgmentText = getAcknowledgmentText(advance);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 500) ?? null;
  const ip = await getClientIp();

  const updated = await applyTransition(actor, advance, "DISBURSED", {
    values: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      acknowledgmentText,
      acknowledgmentIp: ip,
      acknowledgmentUserAgent: userAgent,
    },
    audit: {
      action: "ADVANCE_ACKNOWLEDGED",
      newValues: { status: "ACKNOWLEDGED", acknowledgmentText, userAgent },
    },
    // Sejak dikonfirmasi, dana resmi menjadi tanggungan karyawan:
    // 1. Baris pertama ledger. Saldo inilah yang nanti dikurangi nota yang disetujui.
    // 2. Draf pertanggungjawaban, agar karyawan bisa langsung mengisi nota.
    afterUpdate: async (tx) => {
      await tx.insert(advanceLedgerEntries).values({
        companyId: actor.company.id,
        advanceId: advance.id,
        type: "DISBURSEMENT",
        amount: advance.amount,
        note: "Dana diterima karyawan",
        createdById: actor.id,
      });
      await tx
        .insert(settlements)
        .values({ companyId: actor.company.id, advanceId: advance.id })
        .onConflictDoNothing();
    },
  });
  if (!updated) return STALE;

  after(async () =>
    notifyAcknowledged(
      advance,
      advance.recipientName,
      await getOwnerContacts(actor.company.id, [advance.disbursedById]),
    ),
  );
  return done();
}

// ---------------------------------------------------------------------------
// Laporkan tidak sesuai (karyawan penerima)
// ---------------------------------------------------------------------------

// Status tetap DISBURSED. OWNER/pencair mengecek, lalu membatalkan & mencatat
// ulang bila keliru, atau meminta karyawan mengonfirmasi bila sudah benar.
export async function disputeAdvance(advanceId: string, reason: string): Promise<ActionResult> {
  const loaded = await loadAdvance(advanceId);
  if (!loaded.success) return loaded;
  const { actor, advance } = loaded.data;
  if (!getAvailableActions(advance, actor).dispute) return FORBIDDEN;

  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return reasonError(parsedReason.error);

  const updated = await applyTransition(actor, advance, "DISBURSED", {
    values: { disputedAt: new Date(), disputeReason: parsedReason.data },
    where: isNull(advanceRequests.disputedAt),
    audit: { action: "ADVANCE_DISPUTED", newValues: { reason: parsedReason.data } },
  });
  if (!updated) return STALE;

  after(async () =>
    notifyDisputed(
      advance,
      advance.recipientName,
      parsedReason.data,
      await getOwnerContacts(actor.company.id, [advance.disbursedById]),
    ),
  );
  return done();
}

// ---------------------------------------------------------------------------
// Helper (tanpa export → bukan Server Action, tidak bisa dipanggil dari browser)
// ---------------------------------------------------------------------------

// Teks persetujuan untuk uang muka berstatus DISBURSED. Halaman detail
// memanggil buildAcknowledgmentText() dengan data yang sama.
function getAcknowledgmentText(advance: AdvanceDetail) {
  return buildAcknowledgmentText({
    recipientName: advance.recipientName,
    advanceNumber: advance.number,
    amountLabel: formatRupiah(advance.amount),
    purpose: advance.purpose,
    settlementDueLabel: formatDate(advance.settlementDueAt!),
    returnDueDays: advance.returnDueDays!,
  });
}

// Data pencairan. Waktu cair = waktu server saat ini (tidak bisa dimundurkan),
// tenggat dihitung dari pengaturan company yang berlaku saat ini.
async function buildDisbursement(
  actor: CompanyUser,
  method: DisbursementMethod,
  transferReference: string | null,
  recipient: RecipientOption,
) {
  const settings = await getCompanySettings(actor.company.id);
  const disbursedAt = new Date();
  const isTransfer = method === "TRANSFER";
  return {
    disbursedById: actor.id,
    disbursedAt,
    transferReference: isTransfer ? transferReference : null,
    destinationBankName: isTransfer ? recipient.bankName : null,
    destinationAccountNumber: isTransfer ? recipient.bankAccountNumber : null,
    settlementDueAt: endOfDayAfter(disbursedAt, settings.settlementDueDays),
    returnDueDays: settings.returnDueDays,
  };
}

type Loaded = { actor: CompanyUser; advance: AdvanceDetail };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Hanya penerima atau pemegang advance:view-all yang boleh menyentuh data ini.
// Selain itu dijawab "tidak ditemukan" agar keberadaan datanya tidak bocor.
async function loadAdvance(advanceId: string): Promise<ActionResult<Loaded>> {
  const actor = await verifySession();
  const id = advanceIdSchema.safeParse(advanceId);
  if (!id.success) return NOT_FOUND;

  const advance = await getAdvanceDetail(actor.company.id, id.data);
  if (!advance) return NOT_FOUND;
  if (advance.recipientId !== actor.id && !can(actor, "advance:view-all")) return NOT_FOUND;

  return { success: true, data: { actor, advance } };
}

// UPDATE bersyarat + audit dalam satu transaksi. Mengembalikan false bila
// status di database sudah bukan `from` (didahului orang lain).
async function applyTransition(
  actor: CompanyUser,
  advance: AdvanceDetail,
  from: AdvanceStatus,
  change: {
    values: Partial<typeof advanceRequests.$inferInsert>;
    where?: SQL;
    audit: { action: AuditAction; oldValues?: Record<string, unknown>; newValues?: Record<string, unknown> };
    // Perubahan tambahan di transaksi yang sama, hanya bila UPDATE berhasil.
    afterUpdate?: (tx: Transaction) => Promise<void>;
  },
) {
  const ip = await getClientIp();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(advanceRequests)
      .set(change.values)
      .where(and(eq(advanceRequests.id, advance.id), eq(advanceRequests.status, from), change.where))
      .returning({ id: advanceRequests.id });
    if (!row) return false;

    await change.afterUpdate?.(tx);
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        entityName: "advance_requests",
        entityId: advance.id,
        ipAddress: ip,
        ...change.audit,
      },
      tx,
    );
    return true;
  });

  if (updated) revalidateAdvances();
  return updated;
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

// Pesan saat uang muka baru ditolak karena terlalu banyak yang tertunda.
// "self" = karyawan yang mengajukan sendiri (sapaan "Anda").
function overdueMessage(overdue: number, limit: number, self: boolean, name = "") {
  const who = self ? "Anda masih" : `${name} masih`;
  const next = self ? "Kirimkan pertanggungjawaban" : "Pertanggungjawaban";
  return `${who} memiliki ${overdue} uang muka yang belum dipertanggungjawabkan melewati batas unggah nota (batas: ${limit}). ${next} dulu sebelum menerima uang muka baru.`;
}

function fieldError(field: string, message: string) {
  return { success: false as const, message: "Periksa kembali isian Anda.", fieldErrors: { [field]: [message] } };
}

function reasonError(error: z.ZodError) {
  return fieldError("reason", z.flattenError(error).formErrors[0] ?? "Alasan tidak valid");
}

// "layout" mencakup /advances, /advances/new, dan /advances/[id]. Beranda
// (ringkasan) dan Pertanggungjawaban ikut menampilkan status uang muka.
function revalidateAdvances() {
  revalidatePath("/advances", "layout");
  revalidatePath("/settlements", "layout");
  revalidatePath("/beranda");
  revalidatePath("/projects", "layout");
}
