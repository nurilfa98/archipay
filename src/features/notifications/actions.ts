// Server Action pemberitahuan: tandai dibuka, tandai semua dibuka, dan angka
// lonceng terbaru (dipanggil lonceng di browser setiap pindah halaman).

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAccount } from "@/lib/auth/dal";
import { getNotifications, hasUrgent } from "./queries";
import { markAllRead, markRead } from "./service";

export type BellState = { count: number; urgent: boolean };

export async function fetchBellState(): Promise<BellState> {
  const user = await verifyAccount();
  const cards = await getNotifications(user);
  return { count: cards.length, urgent: hasUrgent(cards) };
}

const idSchema = z.string().trim().min(1).max(36);

// Dipanggil saat kartu kabar diklik; tidak memicu revalidate agar tidak
// bertabrakan dengan perpindahan halaman yang sedang berjalan.
export async function markNotificationRead(id: string): Promise<void> {
  const user = await verifyAccount();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return;
  await markRead(user.id, parsed.data);
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await verifyAccount();
  await markAllRead(user.id);
  revalidatePath("/notifications");
}
