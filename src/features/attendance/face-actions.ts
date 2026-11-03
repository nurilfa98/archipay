// Server Action persetujuan data & foto acuan wajah (BUSINESS-FLOW §18.4).
//
// - User wajib absen (attendance:check-in) menyetujui pernyataan PDP, lalu
//   mengirim selfie acuan + face embedding yang dihitung di HP.
// - Owner / Admin HR (attendance:approve-face) menyetujui atau menolaknya.
//   Tidak ada yang bisa menyetujui foto wajahnya sendiri.

"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, isUniqueViolation } from "@/lib/db";
import { attendanceConsents, faceProfiles, users } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import { deleteObject, putObject } from "@/lib/storage";
import type { ActionResult } from "@/types/action-result";
import { consentStatement, FACE_MODEL_VERSION } from "./constants";
import { hasConsent } from "./queries";
import { faceSubmissionSchema, idSchema, rejectReasonSchema } from "./schemas";

const FORBIDDEN = {
  success: false,
  message: "Anda tidak memiliki akses.",
} as const;
const NOT_FOUND = {
  success: false,
  message: "Foto wajah tidak ditemukan atau sudah diproses.",
} as const;

export async function giveAttendanceConsent(): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "attendance:check-in")) return FORBIDDEN;

  const statement = consentStatement(actor.fullName, actor.company.name);
  const ip = await getClientIp();
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(attendanceConsents)
      .values({
        userId: actor.id,
        companyId: actor.company.id,
        statement,
        ipAddress: ip,
      })
      .onConflictDoNothing()
      .returning({ userId: attendanceConsents.userId });
    if (inserted.length === 0) return; // sudah pernah setuju
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "ATTENDANCE_CONSENT_GIVEN",
        entityName: "attendance_consents",
        entityId: actor.id,
        newValues: { consentText: statement },
        ipAddress: ip,
      },
      tx,
    );
  });

  revalidatePath("/attendance", "layout");
  return { success: true, data: undefined };
}

// Mengirim (atau mengganti) foto acuan. Pengajuan yang masih menunggu
// diganti dengan yang baru; foto yang sudah disetujui tetap dipakai absen
// sampai penggantinya disetujui.
export async function submitFaceProfile(formData: FormData): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "attendance:check-in")) return FORBIDDEN;
  if (!(await hasConsent(actor.id))) {
    return {
      success: false,
      message: "Setujui dulu pernyataan pengolahan data wajah & lokasi.",
    };
  }

  const parsed = faceSubmissionSchema.safeParse({
    photo: formData.get("photo"),
    embedding: formData.get("embedding") ?? "",
  });
  if (!parsed.success) {
    return {
      success: false,
      message: z.flattenError(parsed.error).fieldErrors.photo?.[0] ?? "Data wajah tidak valid. Ambil ulang foto.",
    };
  }

  const profileId = crypto.randomUUID();
  const photoKey = `${actor.company.id}/faces/${actor.id}/${profileId}.jpg`;
  await putObject(photoKey, new Uint8Array(await parsed.data.photo.arrayBuffer()), "image/jpeg");

  const ip = await getClientIp();
  let replacedKeys: string[] = [];
  try {
    replacedKeys = await db.transaction(async (tx) => {
      const replaced = await tx
        .delete(faceProfiles)
        .where(
          and(
            eq(faceProfiles.userId, actor.id),
            eq(faceProfiles.companyId, actor.company.id),
            ne(faceProfiles.status, "APPROVED"),
          ),
        )
        .returning({ photoKey: faceProfiles.photoKey });
      await tx.insert(faceProfiles).values({
        id: profileId,
        companyId: actor.company.id,
        userId: actor.id,
        photoKey,
        embedding: parsed.data.embedding,
        modelVersion: FACE_MODEL_VERSION,
        status: "PENDING",
      });
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "FACE_PROFILE_SUBMITTED",
          entityName: "face_profiles",
          entityId: profileId,
          ipAddress: ip,
        },
        tx,
      );
      return replaced.map((row) => row.photoKey).filter((key): key is string => key !== null);
    });
  } catch (error) {
    await deleteObject(photoKey).catch(() => undefined);
    if (isUniqueViolation(error))
      return {
        success: false,
        message: "Foto sedang diproses. Muat ulang halaman.",
      };
    throw error;
  }

  deleteFilesLater(replacedKeys);
  revalidatePath("/attendance", "layout");
  return { success: true, data: undefined };
}

export async function approveFaceProfile(profileId: string): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "attendance:approve-face")) return FORBIDDEN;
  const id = idSchema.safeParse(profileId);
  if (!id.success) return NOT_FOUND;

  const ip = await getClientIp();
  const result = await db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ userId: faceProfiles.userId, fullName: users.fullName })
      .from(faceProfiles)
      .innerJoin(users, eq(faceProfiles.userId, users.id))
      .where(
        and(
          eq(faceProfiles.id, id.data),
          eq(faceProfiles.companyId, actor.company.id),
          eq(faceProfiles.status, "PENDING"),
        ),
      )
      .limit(1)
      .for("update");
    if (!profile) return NOT_FOUND;
    if (profile.userId === actor.id) {
      return {
        success: false as const,
        message: "Foto wajah Anda sendiri harus disetujui orang lain.",
      };
    }

    // Foto lama diganti: baris & filenya dihapus.
    const previous = await tx
      .delete(faceProfiles)
      .where(and(eq(faceProfiles.userId, profile.userId), eq(faceProfiles.status, "APPROVED")))
      .returning({ photoKey: faceProfiles.photoKey });
    await tx
      .update(faceProfiles)
      .set({
        status: "APPROVED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
      })
      .where(eq(faceProfiles.id, id.data));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "FACE_PROFILE_APPROVED",
        entityName: "face_profiles",
        entityId: id.data,
        newValues: {
          employeeName: profile.fullName,
          replacedPrevious: previous.length > 0,
        },
        ipAddress: ip,
      },
      tx,
    );
    return {
      success: true as const,
      keys: previous.map((row) => row.photoKey).filter((key): key is string => !!key),
    };
  });
  if (!result.success) return result;

  deleteFilesLater(result.keys);
  revalidatePath("/attendance", "layout");
  return { success: true, data: undefined };
}

export async function rejectFaceProfile(profileId: string, formData: FormData): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "attendance:approve-face")) return FORBIDDEN;
  const id = idSchema.safeParse(profileId);
  if (!id.success) return NOT_FOUND;
  const reason = rejectReasonSchema.safeParse(formData.get("reason"));
  if (!reason.success) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: {
        reason: [z.flattenError(reason.error).formErrors[0] ?? "Alasan tidak valid"],
      },
    };
  }

  const ip = await getClientIp();
  const result = await db.transaction(async (tx) => {
    const [profile] = await tx
      .select({
        userId: faceProfiles.userId,
        photoKey: faceProfiles.photoKey,
        fullName: users.fullName,
      })
      .from(faceProfiles)
      .innerJoin(users, eq(faceProfiles.userId, users.id))
      .where(
        and(
          eq(faceProfiles.id, id.data),
          eq(faceProfiles.companyId, actor.company.id),
          eq(faceProfiles.status, "PENDING"),
        ),
      )
      .limit(1)
      .for("update");
    if (!profile) return NOT_FOUND;
    if (profile.userId === actor.id) {
      return {
        success: false as const,
        message: "Foto wajah Anda sendiri harus diproses orang lain.",
      };
    }

    // Hanya penolakan terakhir yang disimpan (untuk menampilkan alasannya).
    await tx
      .delete(faceProfiles)
      .where(and(eq(faceProfiles.userId, profile.userId), eq(faceProfiles.status, "REJECTED")));
    // File foto yang ditolak tidak disimpan lagi (data minimal, UU PDP).
    await tx
      .update(faceProfiles)
      .set({
        status: "REJECTED",
        rejectReason: reason.data,
        photoKey: null,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      })
      .where(eq(faceProfiles.id, id.data));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "FACE_PROFILE_REJECTED",
        entityName: "face_profiles",
        entityId: id.data,
        newValues: {
          employeeName: profile.fullName,
          rejectReason: reason.data,
        },
        ipAddress: ip,
      },
      tx,
    );
    return {
      success: true as const,
      keys: profile.photoKey ? [profile.photoKey] : [],
    };
  });
  if (!result.success) return result;

  deleteFilesLater(result.keys);
  revalidatePath("/attendance", "layout");
  return { success: true, data: undefined };
}

function deleteFilesLater(keys: string[]) {
  if (keys.length === 0) return;
  after(async () => {
    const results = await Promise.allSettled(keys.map((key) => deleteObject(key)));
    const failed = results.filter((item) => item.status === "rejected").length;
    if (failed > 0) console.error(`[attendance] ${failed} file foto wajah gagal dihapus`);
  });
}
