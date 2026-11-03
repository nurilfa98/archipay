// Kabar WhatsApp ke Owner & Admin HR bila ada foto acuan wajah yang menunggu persetujuan
// (BUSINESS-FLOW §18.4). Dijalankan cron harian yang sama dengan pengingat uang
// muka (app/api/cron/reminders/route.ts), bukan saat foto dikirim.
//
// Hemat kuota WhatsApp:
// - Setiap foto hanya diberitahukan SEKALI (face_profiles.owner_notified_at).
//   Foto yang sudah dikabarkan tetapi belum diproses tidak dikirim ulang;
//   jumlahnya tetap tampil di menu Absensi.
// - Semua foto baru dalam satu company digabung menjadi SATU pesan per
//   penerima (Owner & Admin HR aktif). Admin HR tidak menerima kabar fotonya
//   sendiri (ia tidak boleh menyetujuinya).
//
// Anti-dobel: foto ditandai sebelum pesan dikirim, sehingga cron yang
// berjalan dua kali tidak mengirim ganda. Bila semua pengiriman gagal
// (misal Fonnte bermasalah), tandanya dihapus lagi agar dicoba di jadwal
// berikutnya. Penerima tanpa nomor WhatsApp: tidak dicoba ulang.
// Company nonaktif dilewati.

import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getOwnerContacts } from "@/features/advances/queries";
import { db } from "@/lib/db";
import { companies, faceProfiles, roles, userRoles, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendWhatsApp } from "@/lib/whatsapp";

// Nama yang ditulis di pesan; sisanya diringkas "dan N lainnya".
const MAX_NAMES = 5;

export async function notifyPendingFaces() {
  const pending = await db
    .select({
      id: faceProfiles.id,
      companyId: faceProfiles.companyId,
      userId: faceProfiles.userId,
      fullName: users.fullName,
    })
    .from(faceProfiles)
    .innerJoin(users, eq(faceProfiles.userId, users.id))
    .innerJoin(companies, eq(faceProfiles.companyId, companies.id))
    .where(
      and(
        eq(faceProfiles.status, "PENDING"),
        isNull(faceProfiles.ownerNotifiedAt),
        eq(companies.isActive, true),
        eq(users.isActive, true),
      ),
    )
    .orderBy(asc(faceProfiles.createdAt));

  const byCompany = new Map<string, typeof pending>();
  for (const row of pending) byCompany.set(row.companyId, [...(byCompany.get(row.companyId) ?? []), row]);

  let companiesNotified = 0;
  for (const [companyId, rows] of byCompany) {
    const ids = rows.map((row) => row.id);
    // Tandai dulu (hanya yang masih menunggu & belum ditandai).
    const marked = await db
      .update(faceProfiles)
      .set({ ownerNotifiedAt: new Date() })
      .where(
        and(inArray(faceProfiles.id, ids), eq(faceProfiles.status, "PENDING"), isNull(faceProfiles.ownerNotifiedAt)),
      )
      .returning({ id: faceProfiles.id });
    if (marked.length === 0) continue;

    const markedIds = new Set(marked.map((row) => row.id));
    const photos = rows.filter((row) => markedIds.has(row.id));
    const [owners, hrAdmins] = await Promise.all([getOwnerContacts(companyId, []), getHrAdminContacts(companyId)]);
    // Satu orang bisa Owner sekaligus Admin HR: cukup satu pesan.
    const recipients = [...new Map([...owners, ...hrAdmins].map((contact) => [contact.id, contact])).values()].filter(
      (contact) => contact.phoneNumber,
    );
    const link = new URL("/attendance/faces", env.NEXT_PUBLIC_APP_URL).toString();
    const messages = recipients.flatMap((contact) => {
      // Foto milik penerima sendiri tidak dikabarkan kepadanya.
      const names = photos.filter((photo) => photo.userId !== contact.id).map((photo) => photo.fullName);
      return names.length > 0
        ? [{ to: contact.phoneNumber!, text: pendingFacesText(contact.fullName, names, link) }]
        : [];
    });

    const results = await Promise.allSettled(messages.map((message) => sendWhatsApp(message)));
    if (results.some((result) => result.status === "fulfilled" && result.value)) {
      companiesNotified += 1;
    } else if (messages.length > 0) {
      await db
        .update(faceProfiles)
        .set({ ownerNotifiedAt: null })
        .where(inArray(faceProfiles.id, [...markedIds]));
    }
  }
  return { companies: companiesNotified };
}

// Admin HR aktif di company ini (penyetuju foto wajah selain Owner).
async function getHrAdminContacts(companyId: string) {
  return db
    .select({ id: users.id, fullName: users.fullName, phoneNumber: users.phoneNumber })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(users.companyId, companyId), eq(roles.name, "HR_ADMIN"), eq(users.isActive, true)));
}

function pendingFacesText(ownerName: string, names: string[], link: string) {
  const shown = names.slice(0, MAX_NAMES).join(", ");
  const others = names.length > MAX_NAMES ? ` dan ${names.length - MAX_NAMES} lainnya` : "";
  return (
    `Halo ${ownerName},\n\n` +
    `Ada *${names.length} foto wajah* baru yang menunggu persetujuan: ${shown}${others}.\n\n` +
    `Karyawan belum bisa absen sebelum fotonya disetujui. Periksa di ArchiPay:\n${link}`
  );
}
