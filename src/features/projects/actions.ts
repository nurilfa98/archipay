// Server Action project (khusus OWNER, permission project:manage).
//
// - Tambah / ubah project (nama, klien, nilai kontrak, ikon).
// - Tandai Selesai / Aktif lagi. Project tidak dihapus agar uang muka lama
//   tetap punya induk. Project Selesai tidak bisa dipilih untuk uang muka baru,
//   tetapi uang muka yang sudah berjalan tidak terpengaruh.
// - Menetapkan project untuk uang muka lama (sebelum fitur project ada).

"use server";

import { and, eq, isNull, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, isUniqueViolation } from "@/lib/db";
import { advanceRequests, projects } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { advanceIdSchema } from "@/features/advances/schemas";
import type { ProjectStatus } from "./constants";
import { getActiveProject } from "./queries";
import { projectIdSchema, projectSchema, projectStatusSchema } from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const NOT_FOUND = { success: false, message: "Project tidak ditemukan." } as const;
const NAME_TAKEN = {
  success: false as const,
  message: "Periksa kembali isian Anda.",
  fieldErrors: { name: ["Nama project sudah dipakai"] },
};

async function getProjectManager() {
  const actor = await verifySession();
  return can(actor, "project:manage") ? actor : null;
}

function parseForm(formData: FormData) {
  return projectSchema.safeParse({
    name: formData.get("name") ?? "",
    client: formData.get("client") ?? "",
    contractValue: formData.get("contractValue") ?? "",
    icon: formData.get("icon") ?? "",
  });
}

export async function createProject(formData: FormData): Promise<ActionResult> {
  const actor = await getProjectManager();
  if (!actor) return FORBIDDEN;

  const parsed = parseForm(formData);
  if (!parsed.success) return invalid(parsed.error);

  const ip = await getClientIp();
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({ ...parsed.data, createdById: actor.id })
        .returning({ id: projects.id });
      await logAudit(
        {
          userId: actor.id,
          action: "PROJECT_CREATED",
          entityName: "projects",
          entityId: created.id,
          newValues: { ...parsed.data, status: "ACTIVE" },
          ipAddress: ip,
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return NAME_TAKEN;
    throw error;
  }

  revalidateProjects();
  return { success: true, data: undefined };
}

export async function updateProject(projectId: string, formData: FormData): Promise<ActionResult> {
  const actor = await getProjectManager();
  if (!actor) return FORBIDDEN;

  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return NOT_FOUND;
  const parsed = parseForm(formData);
  if (!parsed.success) return invalid(parsed.error);

  return applyUpdate(actor.id, id.data, parsed.data);
}

export async function setProjectStatus(projectId: string, status: ProjectStatus): Promise<ActionResult> {
  const actor = await getProjectManager();
  if (!actor) return FORBIDDEN;

  const id = projectIdSchema.safeParse(projectId);
  const parsedStatus = projectStatusSchema.safeParse(status);
  if (!id.success || !parsedStatus.success) return NOT_FOUND;

  return applyUpdate(actor.id, id.data, { status: parsedStatus.data });
}

async function applyUpdate(
  actorId: string,
  projectId: string,
  values: Partial<{
    name: string;
    client: string | null;
    contractValue: number | null;
    icon: string;
    status: ProjectStatus;
  }>,
): Promise<ActionResult> {
  const ip = await getClientIp();
  try {
    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          name: projects.name,
          client: projects.client,
          contractValue: projects.contractValue,
          icon: projects.icon,
          status: projects.status,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!before) return false;

      // Hanya kolom yang benar-benar berubah yang dicatat di audit log.
      const changedKeys = (Object.keys(values) as (keyof typeof values)[]).filter(
        (key) => before[key] !== values[key],
      );
      if (changedKeys.length === 0) return true;

      await tx.update(projects).set(values).where(eq(projects.id, projectId));
      await logAudit(
        {
          userId: actorId,
          action: "PROJECT_UPDATED",
          entityName: "projects",
          entityId: projectId,
          oldValues: Object.fromEntries(changedKeys.map((key) => [key, before[key]])),
          newValues: Object.fromEntries(changedKeys.map((key) => [key, values[key]])),
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

  revalidateProjects();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Tetapkan project untuk uang muka lama
// ---------------------------------------------------------------------------

// Hanya uang muka yang belum punya project dan belum berakhir (selesai,
// ditolak, atau dibatalkan). Uang muka yang sudah punya project tidak
// dipindahkan, agar angka laporan project tidak berubah diam-diam.
export async function assignAdvanceProject(advanceId: string, projectId: string): Promise<ActionResult> {
  const actor = await getProjectManager();
  if (!actor) return FORBIDDEN;

  const advance = advanceIdSchema.safeParse(advanceId);
  const projectParsed = projectIdSchema.safeParse(projectId);
  if (!advance.success) return { success: false, message: "Uang muka tidak ditemukan." };
  if (!projectParsed.success) return { success: false, message: "Pilih project." };

  const project = await getActiveProject(projectParsed.data);
  if (!project) return { success: false, message: "Project tidak ditemukan atau sudah selesai." };

  const ip = await getClientIp();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(advanceRequests)
      .set({ projectId: project.id })
      .where(
        and(
          eq(advanceRequests.id, advance.data),
          isNull(advanceRequests.projectId),
          notInArray(advanceRequests.status, ["CLOSED", "REJECTED", "CANCELLED"]),
        ),
      )
      .returning({ id: advanceRequests.id, number: advanceRequests.number });
    if (!row) return false;

    await logAudit(
      {
        userId: actor.id,
        action: "ADVANCE_PROJECT_ASSIGNED",
        entityName: "advance_requests",
        entityId: row.id,
        oldValues: { projectName: null },
        newValues: { projectName: project.name },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!updated) {
    return {
      success: false,
      message: "Project hanya bisa ditetapkan untuk uang muka yang belum punya project dan belum berakhir.",
    };
  }

  revalidateProjects();
  return { success: true, data: undefined };
}

function revalidateProjects() {
  revalidatePath("/projects", "layout");
  revalidatePath("/beranda");
  revalidatePath("/advances", "layout");
  revalidatePath("/settlements", "layout");
}

function invalid(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}
