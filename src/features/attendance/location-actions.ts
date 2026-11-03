// Server Action lokasi absensi (OWNER & Admin HR, permission
// attendance:manage-locations): tambah, ubah, aktif/nonaktif, impor banyak
// lokasi sekaligus, dan cari alamat di peta (BUSINESS-FLOW §18.3).

"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession, type CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, isUniqueViolation } from "@/lib/db";
import { attendanceLocations, projects } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import {
  idSchema,
  importLocationRowSchema,
  importLocationsSchema,
  locationSchema,
  placeQuerySchema,
  type LocationInput,
} from "./schemas";

const FORBIDDEN = {
  success: false,
  message: "Anda tidak memiliki akses.",
} as const;
const NOT_FOUND = {
  success: false,
  message: "Lokasi tidak ditemukan.",
} as const;
const NAME_TAKEN = {
  success: false as const,
  message: "Periksa kembali isian Anda.",
  fieldErrors: { name: ["Nama lokasi sudah dipakai"] },
};

async function getLocationManager() {
  const actor = await verifySession();
  return can(actor, "attendance:manage-locations") ? actor : null;
}

function readLocationForm(formData: FormData) {
  return locationSchema.safeParse({
    name: formData.get("name"),
    // "none" = pilihan "Tanpa project" di form.
    projectId: formData.get("projectId") === "none" ? "" : (formData.get("projectId") ?? ""),
    coordinates: formData.get("coordinates"),
    radiusMeters: formData.get("radiusMeters"),
    timezone: formData.get("timezone"),
    // Jam khusus hanya dibaca bila dicentang; selain itu ikut jam company.
    workStartMinute: formData.get("customHours") ? (formData.get("workStart") ?? "") : "",
    workEndMinute: formData.get("customHours") ? (formData.get("workEnd") ?? "") : "",
  });
}

// Project harus milik company yang sama.
async function projectBelongs(companyId: string, projectId: string | null) {
  if (!projectId) return true;
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)))
    .limit(1);
  return !!row;
}

function toValues(input: LocationInput) {
  return {
    name: input.name,
    projectId: input.projectId,
    latitude: input.coordinates.lat,
    longitude: input.coordinates.lng,
    radiusMeters: input.radiusMeters,
    timezone: input.timezone,
    workStartMinute: input.workStartMinute,
    workEndMinute: input.workEndMinute,
  };
}

export async function createLocation(formData: FormData): Promise<ActionResult> {
  const actor = await getLocationManager();
  if (!actor) return FORBIDDEN;

  const parsed = readLocationForm(formData);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await projectBelongs(actor.company.id, parsed.data.projectId))) return projectNotFound();

  const values = toValues(parsed.data);
  const ip = await getClientIp();
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(attendanceLocations)
        .values({
          ...values,
          companyId: actor.company.id,
          createdById: actor.id,
        })
        .returning({ id: attendanceLocations.id });
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "ATTENDANCE_LOCATION_CREATED",
          entityName: "attendance_locations",
          entityId: created.id,
          newValues: values,
          ipAddress: ip,
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return NAME_TAKEN;
    throw error;
  }

  revalidateLocations();
  return { success: true, data: undefined };
}

export async function updateLocation(locationId: string, formData: FormData): Promise<ActionResult> {
  const actor = await getLocationManager();
  if (!actor) return FORBIDDEN;

  const id = idSchema.safeParse(locationId);
  if (!id.success) return NOT_FOUND;
  const parsed = readLocationForm(formData);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await projectBelongs(actor.company.id, parsed.data.projectId))) return projectNotFound();

  return changeLocation(actor, id.data, toValues(parsed.data));
}

export async function setLocationActive(locationId: string, isActive: boolean): Promise<ActionResult> {
  const actor = await getLocationManager();
  if (!actor) return FORBIDDEN;

  const id = idSchema.safeParse(locationId);
  if (!id.success || typeof isActive !== "boolean") return NOT_FOUND;
  return changeLocation(actor, id.data, { isActive });
}

async function changeLocation(
  actor: CompanyUser,
  locationId: string,
  values: Partial<ReturnType<typeof toValues>> & { isActive?: boolean },
): Promise<ActionResult> {
  const ip = await getClientIp();
  try {
    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          name: attendanceLocations.name,
          projectId: attendanceLocations.projectId,
          latitude: attendanceLocations.latitude,
          longitude: attendanceLocations.longitude,
          radiusMeters: attendanceLocations.radiusMeters,
          timezone: attendanceLocations.timezone,
          workStartMinute: attendanceLocations.workStartMinute,
          workEndMinute: attendanceLocations.workEndMinute,
          isActive: attendanceLocations.isActive,
        })
        .from(attendanceLocations)
        .where(and(eq(attendanceLocations.id, locationId), eq(attendanceLocations.companyId, actor.company.id)))
        .limit(1);
      if (!before) return false;

      const changed = (Object.keys(values) as (keyof typeof values)[]).filter((key) => before[key] !== values[key]);
      if (changed.length === 0) return true;

      await tx.update(attendanceLocations).set(values).where(eq(attendanceLocations.id, locationId));
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "ATTENDANCE_LOCATION_UPDATED",
          entityName: "attendance_locations",
          entityId: locationId,
          oldValues: {
            name: before.name,
            ...Object.fromEntries(changed.map((key) => [key, before[key]])),
          },
          newValues: Object.fromEntries(changed.map((key) => [key, values[key]])),
          ipAddress: ip,
        },
        tx,
      );
      return true;
    });
    if (!updated) return NOT_FOUND;
  } catch (error) {
    if (isUniqueViolation(error)) return NAME_TAKEN;
    throw error;
  }

  revalidateLocations();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Impor / tambah banyak
// ---------------------------------------------------------------------------

// Semua baris disimpan sekaligus, atau tidak sama sekali. Bila ada baris yang
// salah, hasilnya `fieldErrors` dengan kunci nomor baris (0, 1, ...) agar
// tabel pratinjau bisa menandai baris tersebut.
export async function importLocations(rows: unknown[]): Promise<ActionResult<{ count: number }>> {
  const actor = await getLocationManager();
  if (!actor) return FORBIDDEN;

  const list = importLocationsSchema.safeParse(rows);
  if (!list.success)
    return {
      success: false,
      message: z.flattenError(list.error).formErrors[0] ?? "Data tidak valid.",
    };

  const rowErrors: Record<string, string[]> = {};
  const parsedRows = list.data.map((row, index) => {
    const parsed = importLocationRowSchema.safeParse(row);
    if (!parsed.success) {
      rowErrors[index] = [...new Set(parsed.error.issues.map((issue) => issue.message))];
      return null;
    }
    return parsed.data;
  });

  // Nama unik di dalam file dan terhadap lokasi yang sudah ada (pilihan "a":
  // nama yang sudah ada ditolak, tidak menimpa data lama).
  const seen = new Map<string, number>();
  parsedRows.forEach((row, index) => {
    if (!row) return;
    const key = row.name.toLowerCase();
    if (seen.has(key)) addError(rowErrors, index, `Nama sama dengan baris ${seen.get(key)! + 1}`);
    else seen.set(key, index);
  });

  const names = parsedRows.filter((row) => row !== null).map((row) => row.name);
  const [existing, companyProjects] = await Promise.all([
    names.length > 0
      ? db
          .select({ name: attendanceLocations.name })
          .from(attendanceLocations)
          .where(and(eq(attendanceLocations.companyId, actor.company.id), inArray(attendanceLocations.name, names)))
      : [],
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.companyId, actor.company.id)),
  ]);
  const existingNames = new Set(existing.map((row) => row.name.toLowerCase()));
  const projectByName = new Map(companyProjects.map((project) => [project.name.toLowerCase(), project.id]));

  const values = parsedRows.map((row, index) => {
    if (!row) return null;
    if (existingNames.has(row.name.toLowerCase())) addError(rowErrors, index, "Nama lokasi sudah ada di ArchiPay");
    const projectId = row.projectName ? projectByName.get(row.projectName.toLowerCase()) : null;
    if (row.projectName && !projectId) addError(rowErrors, index, `Project "${row.projectName}" tidak ditemukan`);
    return {
      companyId: actor.company.id,
      createdById: actor.id,
      name: row.name,
      projectId: projectId ?? null,
      latitude: row.coordinates.lat,
      longitude: row.coordinates.lng,
      radiusMeters: row.radiusMeters,
      timezone: row.timezone,
      workStartMinute: row.workStartMinute,
      workEndMinute: row.workEndMinute,
    };
  });

  const errorCount = Object.keys(rowErrors).length;
  if (errorCount > 0) {
    return {
      success: false,
      message: `${errorCount} baris perlu diperbaiki. Belum ada lokasi yang disimpan.`,
      fieldErrors: rowErrors,
    };
  }

  const toInsert = values.filter((value) => value !== null);
  const ip = await getClientIp();
  try {
    await db.transaction(async (tx) => {
      const created = await tx.insert(attendanceLocations).values(toInsert).returning({ id: attendanceLocations.id });
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "ATTENDANCE_LOCATIONS_IMPORTED",
          entityName: "attendance_locations",
          entityId: created[0].id,
          newValues: {
            locationCount: created.length,
            locationNames: toInsert.map((row) => row.name).join(", "),
          },
          ipAddress: ip,
        },
        tx,
      );
    });
  } catch (error) {
    // Nama yang sama baru saja ditambahkan orang lain.
    if (isUniqueViolation(error)) {
      return {
        success: false,
        message: "Ada nama lokasi yang baru saja dipakai. Muat ulang lalu coba lagi.",
      };
    }
    throw error;
  }

  revalidateLocations();
  return { success: true, data: { count: toInsert.length } };
}

function addError(errors: Record<string, string[]>, index: number, message: string) {
  (errors[index] ??= []).push(message);
}

// ---------------------------------------------------------------------------
// Cari alamat (Nominatim / OpenStreetMap)
// ---------------------------------------------------------------------------

export type PlaceResult = { label: string; lat: number; lng: number };

// Aturan pakai Nominatim: maks. 1 permintaan per detik, wajib User-Agent yang
// jelas, dan hasil sebaiknya di-cache. Pencarian hanya dijalankan saat tombol
// Cari ditekan (bukan setiap mengetik). Disimpan di memori server: hilang
// bila server restart, cukup untuk pemakaian kecil ini.
// Referensi: https://operations.osmfoundation.org/policies/nominatim/
const placeCache = new Map<string, PlaceResult[]>();
let lastPlaceRequest = 0;

export async function searchPlaces(query: string): Promise<ActionResult<PlaceResult[]>> {
  const actor = await getLocationManager();
  if (!actor) return FORBIDDEN;

  const parsed = placeQuerySchema.safeParse(query);
  if (!parsed.success)
    return {
      success: false,
      message: z.flattenError(parsed.error).formErrors[0] ?? "Kata kunci tidak valid.",
    };

  const key = parsed.data.toLowerCase();
  const cached = placeCache.get(key);
  if (cached) return { success: true, data: cached };

  const wait = lastPlaceRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastPlaceRequest = Date.now();

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", parsed.data);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "id");
  url.searchParams.set("limit", "5");
  url.searchParams.set("accept-language", "id");

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ArchiPay/1.0 (+https://archipay.realitech.id)",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Nominatim ${response.status}`);
    const body = (await response.json()) as {
      display_name: string;
      lat: string;
      lon: string;
    }[];
    const results = body.map((item) => ({
      label: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
    }));
    if (placeCache.size >= 500) placeCache.delete(placeCache.keys().next().value!);
    placeCache.set(key, results);
    return { success: true, data: results };
  } catch (error) {
    console.error("[attendance] cari alamat gagal", error);
    return {
      success: false,
      message: "Pencarian alamat sedang tidak tersedia. Geser pin di peta secara manual.",
    };
  }
}

function projectNotFound() {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: { projectId: ["Project tidak ditemukan"] },
  };
}

function revalidateLocations() {
  revalidatePath("/attendance", "layout");
}

function invalid(error: z.ZodError) {
  const fieldErrors = z.flattenError(error).fieldErrors as Record<string, string[]>;
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors,
  };
}
