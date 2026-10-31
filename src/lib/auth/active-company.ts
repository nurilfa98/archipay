// "Company aktif" untuk SUPERADMIN.
//
// Owner/Finance/Karyawan terikat satu company (users.company_id). Superadmin
// tidak terikat, tetapi boleh MASUK ke company mana pun untuk melihat datanya
// (menu Company → "Buka"). Company yang sedang dibuka disimpan di cookie ini;
// lib/auth/dal.ts membacanya dan mencocokkannya ke database, lalu semua menu
// company bekerja untuk Superadmin tanpa kode khusus.
//
// Cookie berisi id company saja (tanpa tanda tangan): Superadmin memang berhak
// ke semua company, dan nilainya selalu dicocokkan ke database. Untuk user
// lain cookie ini diabaikan.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md

import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const COOKIE_NAME = "archipay_company";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 hari

export async function readActiveCompanyCookie() {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return value && value.length <= 36 ? value : null;
}

// Hanya boleh dipanggil dari Server Action / Route Handler (menulis cookie).
export async function setActiveCompanyCookie(companyId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, companyId, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearActiveCompanyCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
