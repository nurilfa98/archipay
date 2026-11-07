// Pemberitahuan sekali lewat yang disimpan (tahap 2, BUSINESS-FLOW §23):
// dibuat dari Server Action / cron saat sebuah peristiwa terjadi, dibaca
// lonceng, dan hilang setelah dibuka. Tugas dan pengingat tidak lewat sini.
//
// createNotifications TIDAK pernah melempar error: kabar yang gagal disimpan
// tidak boleh menggagalkan aksi utamanya (disetujui, diverifikasi, dan sebagainya).

import "server-only";
import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { logError } from "@/lib/error-log";
import { notifications } from "@/lib/db/schema";

export type NotificationKind =
  | "ADVANCE_REJECTED"
  | "ADVANCE_CANCELLED"
  | "SETTLEMENT_VERIFIED"
  | "BALANCE_RECORDED"
  | "LEAVE_DECIDED"
  | "LEAVE_CANCELLED"
  | "PAYSLIP_PUBLISHED";

export type NewNotification = {
  companyId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href: string;
};

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

export async function createNotifications(items: NewNotification[]) {
  if (items.length === 0) return;
  try {
    await db.insert(notifications).values(
      items.map((item) => ({
        companyId: item.companyId,
        userId: item.userId,
        kind: item.kind,
        title: cut(item.title, 120),
        body: item.body ? cut(item.body, 300) : null,
        href: item.href,
      })),
    );
  } catch (error) {
    await logError(error, { source: "SERVER_ACTION", action: "simpan pemberitahuan" });
  }
}

// Jumlah maksimal kabar belum dibuka yang ditampilkan.
export const MAX_UNREAD_SHOWN = 30;

export async function listUnreadNotifications(userId: string) {
  return db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(MAX_UNREAD_SHOWN);
}

export async function markRead(userId: string, id: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

// Retensi (dipanggil cron harian): yang sudah dibuka disimpan 14 hari, yang tidak
// pernah dibuka 60 hari.
const READ_RETENTION_DAYS = 14;
const UNREAD_RETENTION_DAYS = 60;

export async function purgeOldNotifications(now = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  const read = await db
    .delete(notifications)
    .where(and(isNotNull(notifications.readAt), lt(notifications.readAt, new Date(now.getTime() - READ_RETENTION_DAYS * day))))
    .returning({ id: notifications.id });
  const stale = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, new Date(now.getTime() - UNREAD_RETENTION_DAYS * day)))
    .returning({ id: notifications.id });
  return { read: read.length, stale: stale.length };
}
