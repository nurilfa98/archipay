// Server Action absen masuk & pulang (BUSINESS-FLOW §18.5–18.7).
//
// Alur di HP: ambil GPS → getCheckContext (lokasi terdekat, mode masuk/pulang,
// perkiraan terlambat/pulang cepat) → selfie dengan liveness → submitAttendance.
//
// Server TIDAK percaya hitungan HP: jarak ke lokasi, jam & tanggal setempat
// (jam server di zona waktu lokasi), terlambat/pulang cepat, dan kecocokan
// wajah dihitung ulang di sini. Wajah tidak cocok → absen ditolak.
//
// Selfie absen TIDAK disimpan: HP hanya mengirim face embedding, server
// membandingkannya dengan foto acuan, lalu yang disimpan hanya data absen
// (jam, lokasi, jarak, skor kecocokan wajah).

"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession, type CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, isUniqueViolation } from "@/lib/db";
import { attendanceHolidays, attendanceLocations, attendancePenalties, attendanceRecords } from "@/lib/db/schema";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { formatLocalClock, localTime } from "./clock";
import { FACE_MODEL_VERSION } from "./constants";
import { faceSimilarity } from "./face-match";
import { distanceMeters } from "./geo";
import {
  getApprovedFace,
  getAttendanceSettings,
  getLatestRecord,
  hasConsent,
  type AttendanceRecordRow,
} from "./queries";
import { listApprovedLeavesOn } from "./leave-queries";
import { isWorkDay } from "./schedule";
import { checkSubmissionSchema, GPS_ACCURACY_MAX, gpsSchema, REASON_MIN } from "./schemas";

export type CheckLocation = {
  id: string;
  name: string;
  distance: number; // meter
  radiusMeters: number;
  latitude: number; // untuk peta di halaman absen
  longitude: number;
  inRadius: boolean;
  timezone: string;
  localMinutes: number; // jam setempat sekarang
  isWorkDay: boolean;
  start: number;
  end: number;
  tolerance: number;
};

export type CheckContext =
  | { mode: "in"; locations: CheckLocation[] }
  | {
      mode: "out";
      locations: CheckLocation[];
      record: {
        checkInLocationName: string;
        checkInClock: string;
        scheduleEnd: number;
        isWorkDay: boolean;
        localMinutes: number;
      };
    }
  | { mode: "done"; message: string };

type Blocked = { success: false; message: string };

async function getChecker(): Promise<CompanyUser | Blocked> {
  const actor = await verifySession();
  if (!can(actor, "attendance:check-in")) return { success: false, message: "Anda tidak wajib absen." };
  if (!(await hasConsent(actor.id))) {
    return { success: false, message: "Setujui dulu pengolahan data wajah & lokasi di menu Absensi." };
  }
  return actor;
}

// Mode berdasarkan absen terakhir: belum absen hari ini → masuk; sudah masuk
// & belum pulang (tanggal kerja yang sama) → pulang; sudah pulang → selesai.
// Absen kemarin yang tidak ditutup tidak bisa dipulangkan lagi (lewat 23.59).
function modeOf(latest: AttendanceRecordRow | null, now: Date): "in" | "out" | "done" {
  if (!latest) return "in";
  if (latest.workDate !== localTime(now, latest.timezone).date) return "in";
  return latest.checkOutAt ? "done" : "out";
}

// Cuti/izin yang disetujui per tanggal (BUSINESS-FLOW §19.4): cuti seharian
// memblokir absen; izin datang terlambat menggeser jam masuk; izin pulang
// cepat memajukan jam pulang.
type DayLeave = {
  fullDay: { typeName: string; number: string } | null;
  lateArrival: number | null;
  earlyLeave: number | null;
};

async function leavesByDate(companyId: string, userId: string, dates: string[]) {
  const leaves = await listApprovedLeavesOn(companyId, userId, dates);
  const map = new Map<string, DayLeave>();
  for (const date of dates) {
    const onDate = leaves.filter((leave) => leave.startDate <= date && leave.endDate >= date);
    const fullDay = onDate.find((leave) => leave.kind === "FULL_DAY");
    map.set(date, {
      fullDay: fullDay ? { typeName: fullDay.typeName, number: fullDay.number } : null,
      lateArrival: onDate.find((leave) => leave.kind === "LATE_ARRIVAL")?.timeMinute ?? null,
      earlyLeave: onDate.find((leave) => leave.kind === "EARLY_LEAVE")?.timeMinute ?? null,
    });
  }
  return map;
}

function onLeaveMessage(leave: DayLeave["fullDay"]) {
  return leave
    ? `Anda sedang ${leave.typeName} hari ini (${leave.number}). Bila ternyata masuk, batalkan dulu di menu Cuti & izin.`
    : null;
}

async function locationsAround(companyId: string, userId: string, point: { lat: number; lng: number }, now: Date) {
  const [locations, settings] = await Promise.all([
    db
      .select()
      .from(attendanceLocations)
      .where(and(eq(attendanceLocations.companyId, companyId), eq(attendanceLocations.isActive, true))),
    getAttendanceSettings(companyId),
  ]);
  const dates = [...new Set(locations.map((location) => localTime(now, location.timezone).date))];
  const holidays = dates.length
    ? await db
        .select({ date: attendanceHolidays.date })
        .from(attendanceHolidays)
        .where(and(eq(attendanceHolidays.companyId, companyId), inArray(attendanceHolidays.date, dates)))
    : [];
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const leaves = await leavesByDate(companyId, userId, dates);

  return locations
    .map((location): CheckLocation & { date: string; onLeave: DayLeave["fullDay"] } => {
      const local = localTime(now, location.timezone);
      const distance = Math.round(distanceMeters(point, { lat: location.latitude, lng: location.longitude }));
      return {
        id: location.id,
        name: location.name,
        distance,
        radiusMeters: location.radiusMeters,
        latitude: location.latitude,
        longitude: location.longitude,
        inRadius: distance <= location.radiusMeters,
        timezone: location.timezone,
        localMinutes: local.minutes,
        date: local.date,
        isWorkDay: isWorkDay(settings.workDays, local.isoWeekday) && !holidayDates.has(local.date),
        // Izin datang terlambat yang disetujui: jam masuk hari itu = jam izin.
        start: Math.max(location.workStartMinute ?? settings.workStartMinute, leaves.get(local.date)?.lateArrival ?? 0),
        end: location.workEndMinute ?? settings.workEndMinute,
        tolerance: settings.lateToleranceMinutes,
        onLeave: leaves.get(local.date)?.fullDay ?? null,
      };
    })
    .sort((a, b) => a.distance - b.distance);
}

export async function getCheckContext(gps: unknown): Promise<ActionResult<CheckContext>> {
  const actor = await getChecker();
  if ("success" in actor) return actor;

  const parsed = gpsSchema.safeParse(gps);
  if (!parsed.success) return { success: false, message: "Lokasi tidak terbaca. Coba lagi." };
  if (parsed.data.accuracy > GPS_ACCURACY_MAX) {
    return {
      success: false,
      message: `Akurasi GPS ±${Math.round(parsed.data.accuracy)} m terlalu rendah (maks. ${GPS_ACCURACY_MAX} m). Coba lagi di tempat terbuka.`,
    };
  }

  const face = await getApprovedFace(actor.company.id, actor.id);
  if (!face) return { success: false, message: "Foto acuan wajah Anda belum disetujui. Daftarkan di menu Absensi." };
  if (face.modelVersion !== FACE_MODEL_VERSION) {
    return { success: false, message: "Foto acuan wajah perlu didaftarkan ulang (versi sistem berubah)." };
  }

  const now = new Date();
  const latest = await getLatestRecord(actor.company.id, actor.id);
  const mode = modeOf(latest, now);
  if (mode === "done") {
    return { success: true, data: { mode, message: "Anda sudah absen masuk dan pulang hari ini." } };
  }

  const all = await locationsAround(
    actor.company.id,
    actor.id,
    { lat: parsed.data.latitude, lng: parsed.data.longitude },
    now,
  );
  if (all.length === 0)
    return { success: false, message: "Belum ada lokasi absensi aktif. Hubungi Owner atau Admin HR." };
  const locations: CheckLocation[] = all;

  if (mode === "in") {
    const blocked = onLeaveMessage(all[0].onLeave);
    if (blocked) return { success: false, message: blocked };
    return { success: true, data: { mode, locations } };
  }
  return {
    success: true,
    data: {
      mode,
      locations,
      record: {
        checkInLocationName: latest!.checkInLocationName,
        checkInClock: formatLocalClock(latest!.checkInAt, latest!.timezone),
        scheduleEnd: await effectiveEnd(actor, latest!),
        isWorkDay: latest!.isWorkDay,
        localMinutes: localTime(now, latest!.timezone).minutes,
      },
    },
  };
}

export async function submitAttendance(formData: FormData): Promise<ActionResult<{ message: string }>> {
  const actor = await getChecker();
  if ("success" in actor) return actor;

  const parsed = checkSubmissionSchema.safeParse({
    mode: formData.get("mode"),
    locationId: formData.get("locationId"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    accuracy: formData.get("accuracy"),
    embedding: formData.get("embedding") ?? "",
    lateReason: formData.get("lateReason") ?? "",
    earlyReason: formData.get("earlyReason") ?? "",
    outsideReason: formData.get("outsideReason") ?? "",
    appealNote: formData.get("appealNote") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
    const general = fieldErrors.embedding?.[0];
    return { success: false, message: general ?? "Periksa kembali isian Anda.", fieldErrors };
  }
  const input = parsed.data;
  if (input.accuracy > GPS_ACCURACY_MAX) {
    return { success: false, message: "Akurasi GPS terlalu rendah. Ambil ulang lokasi di tempat terbuka." };
  }

  // 1. Wajah harus cocok dengan foto acuan yang disetujui.
  const [face, platform] = await Promise.all([getApprovedFace(actor.company.id, actor.id), getPlatformSettings()]);
  if (!face || face.modelVersion !== FACE_MODEL_VERSION) {
    return { success: false, message: "Foto acuan wajah Anda belum siap. Daftarkan ulang di menu Absensi." };
  }
  const score = faceSimilarity(input.embedding, face.embedding);
  const ip = await getClientIp();
  if (score < platform.faceMatchThreshold) {
    await logAudit({
      companyId: actor.company.id,
      userId: actor.id,
      action: "ATTENDANCE_FACE_REJECTED",
      entityName: "users",
      entityId: actor.id,
      newValues: { faceScore: score, faceThreshold: platform.faceMatchThreshold, checkMode: input.mode },
      ipAddress: ip,
    });
    return {
      success: false,
      message: "Wajah tidak cocok dengan foto acuan. Ulangi di tempat terang, hadap kamera langsung, tanpa masker.",
    };
  }

  // 2. Lokasi & jam dihitung ulang di server.
  const now = new Date();
  const point = { lat: input.latitude, lng: input.longitude };
  const location = (await locationsAround(actor.company.id, actor.id, point, now)).find(
    (item) => item.id === input.locationId,
  );
  if (!location) return { success: false, message: "Lokasi tidak ditemukan atau sudah nonaktif. Ambil ulang lokasi." };

  const latest = await getLatestRecord(actor.company.id, actor.id);
  const mode = modeOf(latest, now);
  if (mode !== input.mode) {
    return {
      success: false,
      message:
        mode === "done" ? "Anda sudah absen masuk dan pulang hari ini." : "Status absen berubah. Muat ulang halaman.",
    };
  }

  const fieldErrors: Record<string, string[]> = {};
  if (!location.inRadius && (input.outsideReason?.length ?? 0) < REASON_MIN) {
    fieldErrors.outsideReason = [`Anda di luar radius lokasi. Isi alasan minimal ${REASON_MIN} karakter.`];
  }

  if (input.mode === "in") {
    const blocked = onLeaveMessage(location.onLeave);
    if (blocked) return { success: false, message: blocked };
    const lateMinutes =
      location.isWorkDay && location.localMinutes > location.start + location.tolerance
        ? location.localMinutes - location.start
        : 0;
    if (Object.keys(fieldErrors).length) return { success: false, message: "Periksa kembali isian Anda.", fieldErrors };
    return checkIn(actor, input, location, { now, score, lateMinutes, ip });
  }

  const record = latest!;
  const outLocal = localTime(now, record.timezone);
  const end = await effectiveEnd(actor, record);
  const earlyMinutes = record.isWorkDay && outLocal.minutes < end ? end - outLocal.minutes : 0;
  if (earlyMinutes > 0 && (input.earlyReason?.length ?? 0) < REASON_MIN) {
    fieldErrors.earlyReason = [`Pulang sebelum jam pulang. Isi alasan minimal ${REASON_MIN} karakter.`];
  }
  if (Object.keys(fieldErrors).length) return { success: false, message: "Periksa kembali isian Anda.", fieldErrors };
  return checkOut(actor, input, location, record, { now, score, earlyMinutes, ip });
}

// Jam pulang hari itu: jadwal saat absen masuk, dimajukan bila ada izin pulang
// cepat yang disetujui (boleh disetujui setelah absen masuk).
async function effectiveEnd(actor: CompanyUser, record: AttendanceRecordRow) {
  const leave = (await leavesByDate(actor.company.id, actor.id, [record.workDate])).get(record.workDate);
  return Math.min(record.scheduleEndMinute, leave?.earlyLeave ?? Infinity);
}

type Input = z.infer<typeof checkSubmissionSchema>;

async function checkIn(
  actor: CompanyUser,
  input: Input,
  location: CheckLocation & { date: string },
  meta: { now: Date; score: number; lateMinutes: number; ip: string | null },
): Promise<ActionResult<{ message: string }>> {
  const recordId = crypto.randomUUID();
  const settings = await getAttendanceSettings(actor.company.id);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(attendanceRecords).values({
        id: recordId,
        companyId: actor.company.id,
        userId: actor.id,
        workDate: location.date,
        timezone: location.timezone,
        isWorkDay: location.isWorkDay,
        scheduleStartMinute: location.start,
        scheduleEndMinute: location.end,
        toleranceMinutes: location.tolerance,
        checkInLocationId: location.id,
        checkInAt: meta.now,
        checkInLatitude: input.latitude,
        checkInLongitude: input.longitude,
        checkInAccuracy: Math.round(input.accuracy),
        checkInDistance: location.distance,
        checkInInRadius: location.inRadius,
        checkInFaceScore: meta.score,
        lateMinutes: meta.lateMinutes,
        lateReason: meta.lateMinutes > 0 ? input.lateReason : null,
        checkInOutsideReason: location.inRadius ? null : input.outsideReason,
        appealNote: input.appealNote ? `Masuk: ${input.appealNote}` : null,
      });
      // Denda dicatat dengan nominal saat ini (BUSINESS-FLOW §18.2).
      if (meta.lateMinutes > 0 && settings.latePenaltyAmount > 0) {
        await tx.insert(attendancePenalties).values({
          companyId: actor.company.id,
          recordId,
          userId: actor.id,
          period: location.date.slice(0, 7),
          amount: settings.latePenaltyAmount,
        });
      }
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "ATTENDANCE_CHECKED_IN",
          entityName: "attendance_records",
          entityId: recordId,
          newValues: {
            locationName: location.name,
            distanceMeters: location.distance,
            inRadius: location.inRadius,
            lateMinutes: meta.lateMinutes,
            faceScore: meta.score,
          },
          ipAddress: meta.ip,
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { success: false, message: "Anda sudah absen masuk hari ini." };
    throw error;
  }

  revalidatePath("/attendance", "layout");
  const clock = formatLocalClock(meta.now, location.timezone);
  return {
    success: true,
    data: {
      message:
        meta.lateMinutes > 0
          ? `Absen masuk pukul ${clock}, terlambat ${meta.lateMinutes} menit.`
          : `Absen masuk pukul ${clock}.`,
    },
  };
}

async function checkOut(
  actor: CompanyUser,
  input: Input,
  location: CheckLocation,
  record: AttendanceRecordRow,
  meta: { now: Date; score: number; earlyMinutes: number; ip: string | null },
): Promise<ActionResult<{ message: string }>> {
  const appealNote = input.appealNote
    ? [record.appealNote, `Pulang: ${input.appealNote}`].filter(Boolean).join("\n")
    : record.appealNote;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(attendanceRecords)
      .set({
        checkOutLocationId: location.id,
        checkOutAt: meta.now,
        checkOutLatitude: input.latitude,
        checkOutLongitude: input.longitude,
        checkOutAccuracy: Math.round(input.accuracy),
        checkOutDistance: location.distance,
        checkOutInRadius: location.inRadius,
        checkOutFaceScore: meta.score,
        earlyMinutes: meta.earlyMinutes,
        earlyReason: meta.earlyMinutes > 0 ? input.earlyReason : null,
        checkOutOutsideReason: location.inRadius ? null : input.outsideReason,
        appealNote: appealNote?.slice(0, 1000) ?? null,
      })
      .where(and(eq(attendanceRecords.id, record.id), isNull(attendanceRecords.checkOutAt)))
      .returning({ id: attendanceRecords.id });
    if (!row) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "ATTENDANCE_CHECKED_OUT",
        entityName: "attendance_records",
        entityId: record.id,
        newValues: {
          locationName: location.name,
          distanceMeters: location.distance,
          inRadius: location.inRadius,
          earlyMinutes: meta.earlyMinutes,
          faceScore: meta.score,
        },
        ipAddress: meta.ip,
      },
      tx,
    );
    return true;
  });
  if (!updated) {
    return { success: false, message: "Anda sudah absen pulang hari ini." };
  }

  revalidatePath("/attendance", "layout");
  const clock = formatLocalClock(meta.now, record.timezone);
  return {
    success: true,
    data: {
      message:
        meta.earlyMinutes > 0
          ? `Absen pulang pukul ${clock}, ${meta.earlyMinutes} menit sebelum jam pulang.`
          : `Absen pulang pukul ${clock}.`,
    },
  };
}
