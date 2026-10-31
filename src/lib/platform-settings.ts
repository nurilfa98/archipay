// Pengaturan platform (satu baris, id "default"): kontak admin, QRIS statis,
// masa gratis & tenggang, batas pengguna masa gratis, dan komponen harga
// langganan (features/subscriptions/pricing.ts). Di lib/ karena dibaca lib/auth/dal.ts (masa
// tenggang menentukan akses) dan features/companies (masa gratis company
// baru). Diubah Superadmin di Pengaturan platform (features/subscriptions).

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";

export const PLATFORM_SETTINGS_ID = "default";

export type PlatformSettings = {
  adminPhone: string | null;
  qrisImageKey: string | null;
  freeDays: number;
  graceDays: number;
  trialMaxUsers: number;
  basePrice: number;
  includedUsers: number;
  extraUserPrice: number;
  discount6: number;
  discount12: number;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  adminPhone: null,
  qrisImageKey: null,
  freeDays: 14,
  graceDays: 3,
  trialMaxUsers: 10,
  basePrice: 0,
  includedUsers: 10,
  extraUserPrice: 0,
  discount6: 10,
  discount12: 20,
};

// Baris dibuat saat Pengaturan platform pertama kali disimpan; sebelum itu
// nilai bawaan dipakai agar login & pembuatan company tetap berjalan.
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const [row] = await db
    .select({
      adminPhone: platformSettings.adminPhone,
      qrisImageKey: platformSettings.qrisImageKey,
      freeDays: platformSettings.freeDays,
      graceDays: platformSettings.graceDays,
      trialMaxUsers: platformSettings.trialMaxUsers,
      basePrice: platformSettings.basePrice,
      includedUsers: platformSettings.includedUsers,
      extraUserPrice: platformSettings.extraUserPrice,
      discount6: platformSettings.discount6,
      discount12: platformSettings.discount12,
    })
    .from(platformSettings)
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
    .limit(1);
  return row ?? DEFAULT_PLATFORM_SETTINGS;
}
