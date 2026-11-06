// Bukti & tanggal untuk pengembalian/penggantian saldo (BUSINESS-FLOW §8.1.1),
// dipakai laporan karyawan (return-claim-actions.ts) dan pencatatan langsung
// Owner/Finance (actions.ts). BUKAN Server Action.
//
// - Bukti (foto/PDF) OPSIONAL, diperiksa dari byte awalnya (bukan nama/Content-Type
//   kiriman browser), maksimal 4 MB, disimpan di R2 privat, dan dibuka lewat
//   route berizin (/api/balance-proofs/...). Dihapus otomatis cron setelah masa
//   simpan nota (receipt-retention.ts).
// - Tanggal: tidak boleh ke depan, tidak boleh sebelum dana dicairkan, dan
//   maksimal BACKDATE_MAX_DAYS hari ke belakang, supaya tanggal tidak bisa
//   dimundurkan untuk menyembunyikan keterlambatan. Waktu pencatatan tetap
//   tersimpan terpisah (created_at) dan tercatat di Audit Log.

import "server-only";
import { NextResponse } from "next/server";
import { formatDateOnly, zonedDateString } from "@/lib/dates";
import { getPresignedUrl, putObject, readLocalObject } from "@/lib/storage";
import { BACKDATE_MAX_DAYS, MAX_RECEIPT_BYTES } from "./constants";
import { detectReceiptType } from "./receipt-file";
import { logError } from "@/lib/error-log";

export type ProofFile = { bytes: Uint8Array<ArrayBuffer>; contentType: string; extension: string };

// Isian "proof" dari FormData. File kosong/tidak ada = tanpa bukti (null).
export async function readProofUpload(
  value: FormDataEntryValue | null,
): Promise<{ ok: true; file: ProofFile | null } | { ok: false; message: string }> {
  if (!(value instanceof File) || value.size === 0) return { ok: true, file: null };
  if (value.size > MAX_RECEIPT_BYTES) return { ok: false, message: "Ukuran bukti maksimal 4 MB" };
  const bytes = new Uint8Array(await value.arrayBuffer());
  const type = detectReceiptType(bytes);
  if (!type) return { ok: false, message: "Bukti harus berupa foto (JPG, PNG, WebP) atau PDF" };
  return { ok: true, file: { bytes, ...type } };
}

// Gagal unggah dikembalikan sebagai pesan (bukan dilempar): error yang dilempar
// Server Action tampil sebagai halaman error di production.
export async function storeProof(
  companyId: string,
  folder: string,
  id: string,
  file: ProofFile,
): Promise<{ ok: true; key: string; contentType: string } | { ok: false; message: string }> {
  const key = `${companyId}/${folder}/${id}.${file.extension}`;
  try {
    await putObject(key, file.bytes, file.contentType);
    return { ok: true, key, contentType: file.contentType };
  } catch (error) {
    await logError(error, { source: "EXTERNAL", action: "unggah bukti pengembalian" });
    return { ok: false, message: "Gagal mengunggah bukti. Coba lagi beberapa saat." };
  }
}

// Batas tanggal yang boleh dipilih di form: dari yang paling awal (sejak dana
// dicairkan, maksimal BACKDATE_MAX_DAYS hari ke belakang) sampai hari ini.
export function balanceDateRange(disbursedAt: Date | null, now = new Date()) {
  const today = zonedDateString(now);
  const oldest = zonedDateString(new Date(now.getTime() - BACKDATE_MAX_DAYS * 24 * 60 * 60 * 1000));
  const disbursed = disbursedAt ? zonedDateString(disbursedAt) : today;
  return { today, minDate: disbursed > oldest ? disbursed : oldest };
}

// null = tanggal valid. `earliest` = tanggal dana dicairkan ("2026-11-01").
export function checkBalanceDate(date: string, earliest: string, now = new Date()): string | null {
  const today = zonedDateString(now);
  if (date > today) return "Tanggal tidak boleh setelah hari ini";
  if (date < earliest) return `Tanggal tidak boleh sebelum dana dicairkan (${formatDateOnly(earliest)})`;
  const oldest = zonedDateString(new Date(now.getTime() - BACKDATE_MAX_DAYS * 24 * 60 * 60 * 1000));
  if (date < oldest) return `Tanggal tidak boleh lebih dari ${BACKDATE_MAX_DAYS} hari ke belakang`;
  return null;
}

// Jawaban route bukti: R2 → arahkan ke URL bertanda tangan 5 menit; lokal
// (development) → isi file. Sama dengan app/api/receipts/[itemId]/route.ts.
export async function proofResponse(key: string, contentType: string | null) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const presignedUrl = await getPresignedUrl(key);
  if (presignedUrl) return NextResponse.redirect(presignedUrl, { status: 302, headers });
  const body = await readLocalObject(key);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...headers,
      "Content-Type": contentType ?? "application/octet-stream",
      "Content-Disposition": "inline",
    },
  });
}
