// Pencatat audit log. Dipakai oleh SEMUA fitur (auth, advances, settlements),
// karena itu letaknya di lib/, bukan di features/. Folder features/audit
// nanti berisi halaman untuk MELIHAT log (khusus OWNER).
//
// Aturan pakai:
// - Panggil SETELAH aksi berhasil, dengan data sebelum (oldValues) dan
//   sesudah (newValues) perubahan.
// - Jangan simpan data rahasia (password, token) di oldValues/newValues.
// - Untuk perubahan data penting, kirim `tx` agar log ikut transaksi yang sama:
//   kalau perubahan gagal/di-rollback, log-nya juga batal.
//
//     await db.transaction(async (tx) => {
//       await tx.update(advanceRequests).set({ status: "COMPLETED" })...
//       await logAudit({ ... }, tx);
//     });
//
// Referensi: https://orm.drizzle.team/docs/transactions

import "server-only";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

// Daftar aksi dibuat sebagai union type supaya penamaan konsisten
// dan mudah difilter di halaman audit. Tambahkan seiring fitur bertambah.
export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "USER_PASSWORD_RESET";

type AuditEntry = {
  userId: string | null; // pelaku
  action: AuditAction;
  entityName: string; // nama tabel yang terdampak, misal "users"
  entityId: string; // id baris yang terdampak
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string | null;
};

// Tipe `tx` di dalam db.transaction(async (tx) => ...)
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function logAudit(entry: AuditEntry, tx: typeof db | Transaction = db) {
  await tx.insert(auditLogs).values(entry);
}
