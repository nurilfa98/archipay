// Server Action penggajian bulanan (BUSINESS-FLOW §20.1, §20.4) selama add-on
// Penggajian aktif. Pola maker–checker:
// - Owner & Finance (salary:prepare): buat, hitung ulang, ubah baris draf,
//   tanggal bayar. Finance tidak bisa mengubah slip dirinya sendiri, Owner,
//   atau Finance lain (access.ts). Finance menekan "Kirim ke Owner" ->
//   WhatsApp langsung ke Owner (notifications.ts).
// - Owner (salary:manage): Selesaikan & Buka kunci.
//
// - Buat penggajian / Hitung ulang: draf disusun ulang dari data terbaru
//   (run-data.ts). Baris MANUAL tetap; baris otomatis diganti (perubahan pada
//   baris otomatis hilang). Sisa uang muka & denda yang sudah tercatat untuk
//   periode ini tetap tampil sebagai baris tercatat.
// - Ubah nominal / hapus / tambah baris manual, tanggal bayar: hanya draf.
// - Selesaikan: setiap baris sisa uang muka dicatat ke ledger (postBalanceEntry,
//   sama dengan tombol di Potong Gaji, tanpa WhatsApp), denda ditandai
//   dipotong, lalu penggajian terkunci dan slip tampil ke karyawan.
// - Buka kunci: kembali ke draf; yang sudah tercatat tetap tercatat.

"use server";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { isPeriodLocked } from "@/features/attendance/period-lock";
import { periodLabel } from "@/features/attendance/review-data";
import { createNotifications } from "@/features/notifications/service";
import { postBalanceEntry } from "@/features/settlements/ledger";
import { getSettlementDetail, listPendingReturnClaims } from "@/features/settlements/queries";
import { logAudit } from "@/lib/audit";
import { verifySession, type CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatRupiah } from "@/lib/format";
import { db, isUniqueViolation } from "@/lib/db";
import { attendancePenalties, payrollRuns, payslipLines, payslips } from "@/lib/db/schema";
import { formatDateOnly, zonedDateString } from "@/lib/dates";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { SALARY_EDIT_DENIED, salaryEditChecker } from "./access";
import { EDITABLE_SOURCES, REMOVABLE_SOURCES, type LineSource } from "./constants";
import { notifyPayrollReviewRequested } from "./notifications";
import { totalsOf } from "./payslip-math";
import { getPayrollSettings } from "./queries";
import { buildPayslipDrafts, type PayslipDraft } from "./run-data";
import { createRunSchema, idSchema, lineAmountSchema, manualLineSchema, payDateSchema, periodSchema } from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const NOT_FOUND = { success: false, message: "Penggajian tidak ditemukan." } as const;
const NOT_DRAFT = {
  success: false,
  message: "Penggajian ini sudah diselesaikan. Buka kunci dulu untuk mengubahnya.",
} as const;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getSalaryManager() {
  const actor = await verifySession();
  return can(actor, "salary:manage") ? actor : null;
}

async function getSalaryPreparer() {
  const actor = await verifySession();
  return can(actor, "salary:prepare") ? actor : null;
}

// Draf berubah -> permintaan periksa yang lama tidak berlaku lagi; Finance bisa
// mengirim ulang ke Owner.
async function clearReviewRequest(tx: Transaction, runId: string) {
  await tx
    .update(payrollRuns)
    .set({ reviewRequestedAt: null, reviewRequestedById: null })
    .where(eq(payrollRuns.id, runId));
}

async function findRun(companyId: string, period: string) {
  const [run] = await db
    .select({ id: payrollRuns.id, status: payrollRuns.status, payDate: payrollRuns.payDate })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.companyId, companyId), eq(payrollRuns.period, period)))
    .limit(1);
  return run ?? null;
}

// ---------------------------------------------------------------------------
// Buat & hitung ulang
// ---------------------------------------------------------------------------

export async function createPayrollRun(
  _prevState: ActionResult<{ period: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ period: string }>> {
  const actor = await getSalaryPreparer();
  if (!actor) return FORBIDDEN;
  const parsed = createRunSchema.safeParse({ period: formData.get("period") });
  if (!parsed.success) return invalid(parsed.error);
  const { period } = parsed.data;
  if (period > zonedDateString(new Date()).slice(0, 7)) {
    return fieldError("period", "Penggajian hanya untuk bulan ini atau bulan yang sudah lewat");
  }
  if (await findRun(actor.company.id, period)) {
    return fieldError("period", "Penggajian bulan ini sudah ada. Buka dari daftar di bawah.");
  }

  const drafts = await buildPayslipDrafts(actor.company.id, period, { attendanceActive: actor.company.attendance });
  if (drafts.length === 0) {
    return { success: false, message: "Belum ada karyawan dengan data gaji untuk bulan ini. Isi Data gaji dulu." };
  }

  const ip = await getClientIp();
  try {
    await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(payrollRuns)
        .values({ companyId: actor.company.id, period, createdById: actor.id })
        .returning({ id: payrollRuns.id });
      await saveDrafts(tx, actor.company.id, run.id, drafts);
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "PAYROLL_RUN_CREATED",
          entityName: "payroll_runs",
          entityId: run.id,
          newValues: { period, people: drafts.length },
          ipAddress: ip,
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fieldError("period", "Penggajian bulan ini sudah ada.");
    }
    throw error;
  }

  revalidatePayroll();
  return { success: true, data: { period } };
}

export async function recalculatePayrollRun(period: string): Promise<ActionResult> {
  const actor = await getSalaryPreparer();
  if (!actor) return FORBIDDEN;
  const parsedPeriod = periodSchema.safeParse(period);
  if (!parsedPeriod.success) return NOT_FOUND;
  const run = await findRun(actor.company.id, parsedPeriod.data);
  if (!run) return NOT_FOUND;
  if (run.status !== "DRAFT") return NOT_DRAFT;

  const drafts = await buildPayslipDrafts(actor.company.id, parsedPeriod.data, {
    attendanceActive: actor.company.attendance,
  });
  const ip = await getClientIp();
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: payrollRuns.status })
      .from(payrollRuns)
      .where(eq(payrollRuns.id, run.id))
      .for("update");
    if (locked?.status !== "DRAFT") return;
    await saveDrafts(tx, actor.company.id, run.id, drafts);
    await tx
      .update(payrollRuns)
      .set({ calculatedAt: new Date(), reviewRequestedAt: null, reviewRequestedById: null })
      .where(eq(payrollRuns.id, run.id));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "PAYROLL_RECALCULATED",
        entityName: "payroll_runs",
        entityId: run.id,
        newValues: { period: parsedPeriod.data, people: drafts.length },
        ipAddress: ip,
      },
      tx,
    );
  });

  revalidatePayroll();
  return { success: true, data: undefined };
}

// Simpan draf: slip di-upsert per karyawan, baris otomatis diganti, baris
// manual tetap. Slip karyawan yang tidak lagi ikut dihapus bila tidak punya
// baris manual.
async function saveDrafts(tx: Transaction, companyId: string, runId: string, drafts: PayslipDraft[]) {
  const existing = await tx
    .select({ id: payslips.id, userId: payslips.userId })
    .from(payslips)
    .where(eq(payslips.runId, runId));
  const existingByUser = new Map(existing.map((row) => [row.userId, row.id]));
  const keptIds: string[] = [];

  for (const draft of drafts) {
    const values = {
      fullName: draft.fullName,
      bankName: draft.bankName,
      bankAccountNumber: draft.bankAccountNumber,
      workingDays: draft.days.workingDays,
      presentDays: draft.days.attendance?.present ?? null,
      absentDays: draft.days.attendance?.absent ?? null,
      unpaidLeaveDays: draft.days.attendance?.unpaidLeave ?? null,
      dailyRate: draft.dailyRate,
    };
    let payslipId = existingByUser.get(draft.userId);
    if (payslipId) {
      await tx.update(payslips).set(values).where(eq(payslips.id, payslipId));
      await tx
        .delete(payslipLines)
        .where(and(eq(payslipLines.payslipId, payslipId), ne(payslipLines.source, "MANUAL")));
    } else {
      const [created] = await tx
        .insert(payslips)
        .values({ runId, companyId, userId: draft.userId, ...values })
        .returning({ id: payslips.id });
      payslipId = created.id;
    }
    keptIds.push(payslipId);
    if (draft.lines.length > 0) {
      await tx.insert(payslipLines).values(
        draft.lines.map((line, index) => ({
          payslipId: payslipId!,
          companyId,
          type: line.type,
          source: line.source,
          label: line.label.slice(0, 150),
          amount: line.amount,
          refId: line.refId,
          postedAt: line.postedAt,
          sortOrder: index,
        })),
      );
    }
  }

  // Karyawan yang tidak lagi ikut (data gaji dihapus / masa kerja berubah).
  const dropped = existing.filter((row) => !keptIds.includes(row.id)).map((row) => row.id);
  if (dropped.length > 0) {
    const withManual = await tx
      .selectDistinct({ payslipId: payslipLines.payslipId })
      .from(payslipLines)
      .where(and(inArray(payslipLines.payslipId, dropped), eq(payslipLines.source, "MANUAL")));
    const keep = new Set(withManual.map((row) => row.payslipId));
    const remove = dropped.filter((id) => !keep.has(id));
    if (remove.length > 0) await tx.delete(payslips).where(inArray(payslips.id, remove));
    if (keep.size > 0) {
      await tx
        .delete(payslipLines)
        .where(and(inArray(payslipLines.payslipId, [...keep]), ne(payslipLines.source, "MANUAL")));
      keptIds.push(...keep);
    }
  }
  await refreshTotals(tx, keptIds);
}

async function refreshTotals(tx: Transaction, payslipIds: string[]) {
  if (payslipIds.length === 0) return;
  const lines = await tx
    .select({ payslipId: payslipLines.payslipId, type: payslipLines.type, amount: payslipLines.amount })
    .from(payslipLines)
    .where(inArray(payslipLines.payslipId, payslipIds));
  for (const id of payslipIds) {
    const totals = totalsOf(
      lines
        .filter((line) => line.payslipId === id)
        .map((line) => ({ type: line.type as "EARNING" | "DEDUCTION", amount: line.amount })),
    );
    await tx
      .update(payslips)
      .set({ totalEarnings: totals.earnings, totalDeductions: totals.deductions, netPay: totals.net })
      .where(eq(payslips.id, id));
  }
}

// ---------------------------------------------------------------------------
// Baris slip (hanya draf)
// ---------------------------------------------------------------------------

// Baris + slip + penggajian, terkunci untuk diubah. null = tidak ditemukan.
async function lockLine(tx: Transaction, companyId: string, lineId: string) {
  const [row] = await tx
    .select({
      id: payslipLines.id,
      payslipId: payslipLines.payslipId,
      userId: payslips.userId,
      source: payslipLines.source,
      label: payslipLines.label,
      postedAt: payslipLines.postedAt,
      runId: payslips.runId,
      runStatus: payrollRuns.status,
      period: payrollRuns.period,
      fullName: payslips.fullName,
    })
    .from(payslipLines)
    .innerJoin(payslips, eq(payslipLines.payslipId, payslips.id))
    .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
    .where(and(eq(payslipLines.id, lineId), eq(payslipLines.companyId, companyId)))
    .for("update", { of: payslipLines });
  return row ?? null;
}

export async function updatePayslipLineAmount(lineId: string, formData: FormData): Promise<ActionResult> {
  const actor = await getSalaryPreparer();
  if (!actor) return FORBIDDEN;
  const id = idSchema.safeParse(lineId);
  const parsed = lineAmountSchema.safeParse({ amount: formData.get("amount") ?? "" });
  if (!id.success) return { success: false, message: "Baris tidak ditemukan." };
  if (!parsed.success) return invalid(parsed.error);

  return changeLine(actor, id.data, "Ubah nominal", async (tx, line) => {
    if (!EDITABLE_SOURCES.includes(line.source as LineSource)) return "Nominal baris ini diubah lewat Data gaji.";
    await tx
      .update(payslipLines)
      .set({ amount: parsed.data.amount, edited: line.source !== "MANUAL" })
      .where(eq(payslipLines.id, line.id));
    return null;
  });
}

export async function removePayslipLine(lineId: string): Promise<ActionResult> {
  const actor = await getSalaryPreparer();
  if (!actor) return FORBIDDEN;
  const id = idSchema.safeParse(lineId);
  if (!id.success) return { success: false, message: "Baris tidak ditemukan." };

  return changeLine(actor, id.data, "Hapus baris", async (tx, line) => {
    if (!REMOVABLE_SOURCES.includes(line.source as LineSource)) return "Gaji pokok diubah lewat Data gaji.";
    await tx.delete(payslipLines).where(eq(payslipLines.id, line.id));
    return null;
  });
}

async function changeLine(
  actor: CompanyUser,
  lineId: string,
  change: string,
  apply: (tx: Transaction, line: NonNullable<Awaited<ReturnType<typeof lockLine>>>) => Promise<string | null>,
): Promise<ActionResult> {
  const ip = await getClientIp();
  const canEdit = await salaryEditChecker(actor);
  const result = await db.transaction(async (tx) => {
    const line = await lockLine(tx, actor.company.id, lineId);
    if (!line) return "Baris tidak ditemukan.";
    if (line.runStatus !== "DRAFT") return NOT_DRAFT.message;
    if (!canEdit(line.userId)) return SALARY_EDIT_DENIED;
    if (line.postedAt) return "Baris ini sudah tercatat (ledger/denda) dan tidak bisa diubah.";
    const error = await apply(tx, line);
    if (error) return error;
    await refreshTotals(tx, [line.payslipId]);
    await clearReviewRequest(tx, line.runId);
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "PAYSLIP_LINE_CHANGED",
        entityName: "payroll_runs",
        entityId: line.runId,
        newValues: { period: line.period, employee: line.fullName, change, line: line.label },
        ipAddress: ip,
      },
      tx,
    );
    return null;
  });
  if (result) return { success: false, message: result };
  revalidatePayroll();
  return { success: true, data: undefined };
}

export async function addManualLine(payslipId: string, formData: FormData): Promise<ActionResult> {
  const actor = await getSalaryPreparer();
  if (!actor) return FORBIDDEN;
  const id = idSchema.safeParse(payslipId);
  const parsed = manualLineSchema.safeParse({
    type: formData.get("type"),
    label: formData.get("label") ?? "",
    amount: formData.get("amount") ?? "",
  });
  if (!id.success) return { success: false, message: "Slip tidak ditemukan." };
  if (!parsed.success) return invalid(parsed.error);

  const ip = await getClientIp();
  const canEdit = await salaryEditChecker(actor);
  const error = await db.transaction(async (tx) => {
    const [slip] = await tx
      .select({
        id: payslips.id,
        runId: payslips.runId,
        userId: payslips.userId,
        fullName: payslips.fullName,
        status: payrollRuns.status,
        period: payrollRuns.period,
      })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
      .where(and(eq(payslips.id, id.data), eq(payslips.companyId, actor.company.id)))
      .for("update", { of: payrollRuns });
    if (!slip) return "Slip tidak ditemukan.";
    if (slip.status !== "DRAFT") return NOT_DRAFT.message;
    if (!canEdit(slip.userId)) return SALARY_EDIT_DENIED;
    await tx.insert(payslipLines).values({
      payslipId: slip.id,
      companyId: actor.company.id,
      type: parsed.data.type,
      source: "MANUAL",
      label: parsed.data.label,
      amount: parsed.data.amount,
      sortOrder: 1000,
    });
    await refreshTotals(tx, [slip.id]);
    await clearReviewRequest(tx, slip.runId);
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "PAYSLIP_LINE_CHANGED",
        entityName: "payroll_runs",
        entityId: slip.runId,
        newValues: {
          period: slip.period,
          employee: slip.fullName,
          change: "Tambah baris manual",
          line: parsed.data.label,
        },
        ipAddress: ip,
      },
      tx,
    );
    return null;
  });
  if (error) return { success: false, message: error };
  revalidatePayroll();
  return { success: true, data: undefined };
}

export async function setPayDate(period: string, formData: FormData): Promise<ActionResult> {
  const actor = await getSalaryPreparer();
  if (!actor) return FORBIDDEN;
  const parsedPeriod = periodSchema.safeParse(period);
  const parsed = payDateSchema.safeParse({ payDate: formData.get("payDate") ?? "" });
  if (!parsedPeriod.success) return NOT_FOUND;
  if (!parsed.success) return invalid(parsed.error);

  const [updated] = await db
    .update(payrollRuns)
    .set({ payDate: parsed.data.payDate, reviewRequestedAt: null, reviewRequestedById: null })
    .where(
      and(
        eq(payrollRuns.companyId, actor.company.id),
        eq(payrollRuns.period, parsedPeriod.data),
        eq(payrollRuns.status, "DRAFT"),
      ),
    )
    .returning({ id: payrollRuns.id });
  if (!updated) return NOT_DRAFT;
  revalidatePayroll();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Kirim ke Owner (Finance)
// ---------------------------------------------------------------------------

// Finance selesai menyiapkan draf -> WhatsApp langsung ke semua Owner aktif.
// Sekali per versi draf: tanda dikosongkan setiap draf berubah
// (clearReviewRequest), jadi tombol yang ditekan berulang tidak mengirim ganda.
export async function requestPayrollReview(period: string): Promise<ActionResult> {
  const actor = await getSalaryPreparer();
  if (!actor) return FORBIDDEN;
  const parsedPeriod = periodSchema.safeParse(period);
  if (!parsedPeriod.success) return NOT_FOUND;
  const run = await findRun(actor.company.id, parsedPeriod.data);
  if (!run) return NOT_FOUND;
  if (run.status !== "DRAFT") return NOT_DRAFT;
  if (!run.payDate) return { success: false, message: "Isi tanggal bayar terlebih dahulu." };

  const ip = await getClientIp();
  const people = await db.$count(payslips, eq(payslips.runId, run.id));
  if (people === 0) return { success: false, message: "Belum ada slip di penggajian ini." };

  const requested = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(payrollRuns)
      .set({ reviewRequestedAt: new Date(), reviewRequestedById: actor.id })
      .where(and(eq(payrollRuns.id, run.id), eq(payrollRuns.status, "DRAFT"), isNull(payrollRuns.reviewRequestedAt)))
      .returning({ id: payrollRuns.id });
    if (!updated) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "PAYROLL_REVIEW_REQUESTED",
        entityName: "payroll_runs",
        entityId: run.id,
        newValues: { period: parsedPeriod.data, people },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!requested) {
    return { success: false, message: "Sudah dikirim ke Owner. Kirim lagi setelah ada perubahan." };
  }

  // Tombol tidak menunggu Fonnte.
  after(() =>
    notifyPayrollReviewRequested(actor.company.id, {
      period: parsedPeriod.data,
      people,
      requesterId: actor.id,
      requesterName: actor.fullName,
    }),
  );
  revalidatePayroll();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Selesaikan & buka kunci
// ---------------------------------------------------------------------------

export async function finalizePayrollRun(period: string): Promise<ActionResult> {
  const actor = await getSalaryManager();
  if (!actor) return FORBIDDEN;
  const parsedPeriod = periodSchema.safeParse(period);
  if (!parsedPeriod.success) return NOT_FOUND;
  const companyId = actor.company.id;
  const run = await findRun(companyId, parsedPeriod.data);
  if (!run) return NOT_FOUND;
  if (run.status !== "DRAFT") return NOT_DRAFT;
  if (!run.payDate) return { success: false, message: "Isi tanggal bayar terlebih dahulu." };

  const settings = await getPayrollSettings(companyId);
  if (settings.absenceDeduction && actor.company.attendance && !(await isPeriodLocked(companyId, parsedPeriod.data))) {
    return {
      success: false,
      message: "Kunci periode absensi bulan ini dulu (Absensi → Review bulanan), lalu Hitung ulang.",
    };
  }

  const slips = await db
    .select({ id: payslips.id, userId: payslips.userId, fullName: payslips.fullName, netPay: payslips.netPay })
    .from(payslips)
    .where(eq(payslips.runId, run.id));
  if (slips.length === 0) return { success: false, message: "Belum ada slip di penggajian ini." };
  const negative = slips.find((slip) => slip.netPay < 0);
  if (negative) {
    return { success: false, message: `Gaji bersih ${negative.fullName} minus. Kurangi potongannya dulu.` };
  }
  // Karyawan yang sudah melapor mengembalikan sisa dana (lewat batas) tapi belum
  // diputuskan Owner/Finance: sisa uang mukanya tidak ikut dipotong, jadi
  // penggajian ditahan sampai laporannya dikonfirmasi atau ditolak.
  const waiting = await listPendingReturnClaims(companyId, {
    overdueOnly: true,
    userIds: slips.map((slip) => slip.userId),
  });
  if (waiting.length > 0) {
    return {
      success: false,
      message: `Ada laporan pengembalian yang belum diputuskan: ${[...new Set(waiting.map((claim) => claim.recipientName))].join(", ")}. Konfirmasi atau tolak dulu di menu Pertanggungjawaban, lalu Hitung ulang.`,
    };
  }

  // 1. Catat sisa uang muka (potongan) dan penggantian kekurangan (pendapatan)
  //    ke ledger, satu baris per transaksi.
  const pending = await db
    .select({
      id: payslipLines.id,
      source: payslipLines.source,
      label: payslipLines.label,
      amount: payslipLines.amount,
      refId: payslipLines.refId,
      userId: payslips.userId,
      fullName: payslips.fullName,
    })
    .from(payslipLines)
    .innerJoin(payslips, eq(payslipLines.payslipId, payslips.id))
    .where(
      and(
        eq(payslips.runId, run.id),
        inArray(payslipLines.source, ["ADVANCE", "REIMBURSE"]),
        isNull(payslipLines.postedAt),
      ),
    );

  for (const line of pending) {
    if (line.amount <= 0 || !line.refId) continue;
    // REIMBURSE = penggantian kekurangan dibayar lewat slip (BUSINESS-FLOW §8.1.2).
    const reimburse = line.source === "REIMBURSE";
    const failure = `${line.fullName}: ${line.label} tidak bisa dicatat`;
    const settlement = await getSettlementDetail(companyId, line.refId);
    if (
      !settlement ||
      settlement.advanceStatus !== (reimburse ? "REIMBURSE_PENDING" : "RETURN_PENDING") ||
      settlement.recipientId !== line.userId
    ) {
      return { success: false, message: `${failure} (sudah lunas atau berubah). Tekan Hitung ulang.` };
    }
    if (settlement.recipientId === actor.id) {
      return {
        success: false,
        message: `${failure}: tidak bisa mencatat ${reimburse ? "penggantian" : "potongan"} untuk diri sendiri.`,
      };
    }
    const result = await postBalanceEntry({
      actor,
      advanceId: settlement.advanceId,
      settlementId: settlement.id,
      type: reimburse ? "REIMBURSEMENT" : "PAYROLL_DEDUCTION",
      amount: line.amount,
      method: "PAYROLL",
      reference: null,
      payrollPeriod: parsedPeriod.data,
      note: reimburse
        ? `Penggantian lewat penggajian periode ${parsedPeriod.data}`
        : `Potong gaji periode ${parsedPeriod.data} (Penggajian)`,
      audit: reimburse ? "PAYROLL_REIMBURSEMENT_RECORDED" : "PAYROLL_DEDUCTION_RECORDED",
      // Dibayar lewat gaji: tanggalnya = tanggal bayar penggajian; slip = buktinya
      // (tanpa konfirmasi karyawan).
      receivedOn: reimburse ? run.payDate : null,
      onPosted: async (tx) => {
        await tx.update(payslipLines).set({ postedAt: new Date() }).where(eq(payslipLines.id, line.id));
      },
    });
    if (!result.ok) {
      const detail =
        result.reason === "EXCEEDS" ? `melebihi sisa ${formatRupiah(result.outstanding)}` : "sudah lunas atau berubah";
      return { success: false, message: `${failure} (${detail}). Tekan Hitung ulang.` };
    }
  }

  // 2. Denda ditandai dipotong + penggajian dikunci, dalam satu transaksi.
  const ip = await getClientIp();
  const finalized = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: payrollRuns.status })
      .from(payrollRuns)
      .where(eq(payrollRuns.id, run.id))
      .for("update");
    if (locked?.status !== "DRAFT") return false;

    const penaltyLines = await tx
      .select({ id: payslipLines.id, refId: payslipLines.refId, userId: payslips.userId })
      .from(payslipLines)
      .innerJoin(payslips, eq(payslipLines.payslipId, payslips.id))
      .where(and(eq(payslips.runId, run.id), eq(payslipLines.source, "PENALTY"), isNull(payslipLines.postedAt)));
    const now = new Date();
    for (const line of penaltyLines) {
      if (!line.refId || line.userId === actor.id) continue;
      await tx
        .update(attendancePenalties)
        .set({ deductedAt: now, deductedById: actor.id, payrollPeriod: parsedPeriod.data })
        .where(
          and(
            eq(attendancePenalties.companyId, companyId),
            eq(attendancePenalties.userId, line.userId),
            eq(attendancePenalties.period, line.refId),
            eq(attendancePenalties.status, "ACTIVE"),
            isNull(attendancePenalties.deductedAt),
          ),
        );
      await tx.update(payslipLines).set({ postedAt: now }).where(eq(payslipLines.id, line.id));
    }

    await tx
      .update(payrollRuns)
      .set({ status: "FINALIZED", finalizedAt: now, finalizedById: actor.id })
      .where(eq(payrollRuns.id, run.id));
    await logAudit(
      {
        companyId,
        userId: actor.id,
        action: "PAYROLL_FINALIZED",
        entityName: "payroll_runs",
        entityId: run.id,
        newValues: {
          period: parsedPeriod.data,
          payDate: run.payDate,
          people: slips.length,
          advanceDeductions: pending.length,
          penaltyGroups: penaltyLines.length,
        },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!finalized) return NOT_DRAFT;

  // Kabar "slip gaji terbit" ke tiap karyawan lewat lonceng (tanpa WhatsApp/email, hemat kuota).
  const periodText = periodLabel(parsedPeriod.data);
  after(() =>
    createNotifications(
      slips
        .filter((slip) => slip.userId !== actor.id)
        .map((slip) => ({
          companyId,
          userId: slip.userId,
          kind: "PAYSLIP_PUBLISHED" as const,
          title: `Slip gaji ${periodText} sudah terbit`,
          body: run.payDate ? `Gaji bersih ${formatRupiah(slip.netPay)}, dibayar ${formatDateOnly(run.payDate)}.` : null,
          href: "/payslips",
        })),
    ),
  );

  revalidatePayroll();
  revalidatePath("/payroll-deductions");
  revalidatePath("/settlements", "layout");
  revalidatePath("/advances", "layout");
  revalidatePath("/projects", "layout");
  revalidatePath("/beranda");
  return { success: true, data: undefined };
}

export async function reopenPayrollRun(period: string): Promise<ActionResult> {
  const actor = await getSalaryManager();
  if (!actor) return FORBIDDEN;
  const parsedPeriod = periodSchema.safeParse(period);
  if (!parsedPeriod.success) return NOT_FOUND;

  const ip = await getClientIp();
  const reopened = await db.transaction(async (tx) => {
    const [run] = await tx
      .update(payrollRuns)
      .set({
        status: "DRAFT",
        finalizedAt: null,
        finalizedById: null,
        reviewRequestedAt: null,
        reviewRequestedById: null,
      })
      .where(
        and(
          eq(payrollRuns.companyId, actor.company.id),
          eq(payrollRuns.period, parsedPeriod.data),
          eq(payrollRuns.status, "FINALIZED"),
        ),
      )
      .returning({ id: payrollRuns.id });
    if (!run) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "PAYROLL_REOPENED",
        entityName: "payroll_runs",
        entityId: run.id,
        newValues: { period: parsedPeriod.data },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!reopened) return NOT_FOUND;

  revalidatePayroll();
  return { success: true, data: undefined };
}

function revalidatePayroll() {
  revalidatePath("/payroll", "layout");
  revalidatePath("/payslips");
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
