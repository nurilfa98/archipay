// Query database untuk project. Hasilnya DTO (hanya kolom yang dibutuhkan).
//
// Nilai kontrak hanya dikembalikan oleh listProjectsForManage(), yang
// pemanggilnya WAJIB sudah memeriksa project:manage (OWNER). Query lain
// (kartu pilihan project, banner) tidak pernah membawa angka itu, sehingga
// tidak bisa bocor ke Finance atau karyawan.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md

import "server-only";
import { and, asc, desc, eq, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import { io } from "next/cache";
import { cache } from "react";
import { AWAITING_RECEIPT_STATUSES, type AdvanceStatus } from "@/features/advances/constants";
import { db } from "@/lib/db";
import { advanceRequests, projects } from "@/lib/db/schema";
import { DEFAULT_PROJECT_ICON, isProjectIcon, NO_PROJECT, type ProjectIconKey, type ProjectStatus } from "./constants";

export type ProjectInfo = {
  id: string;
  name: string;
  client: string | null;
  icon: ProjectIconKey;
  status: ProjectStatus;
};

const infoColumns = {
  id: projects.id,
  name: projects.name,
  client: projects.client,
  icon: projects.icon,
  status: projects.status,
};

function toInfo(row: { id: string; name: string; client: string | null; icon: string; status: string }): ProjectInfo {
  return {
    ...row,
    icon: isProjectIcon(row.icon) ? row.icon : DEFAULT_PROJECT_ICON,
    status: row.status as ProjectStatus,
  };
}

// Syarat WHERE untuk ?project= : kosong = semua project, "none" = uang muka
// lama tanpa project, selain itu = id project.
export function projectCondition(project: string | undefined): SQL | undefined {
  if (!project) return undefined;
  return project === NO_PROJECT ? isNull(advanceRequests.projectId) : eq(advanceRequests.projectId, project);
}

export async function getProjectInfo(projectId: string): Promise<ProjectInfo | null> {
  await io();
  const [row] = await db.select(infoColumns).from(projects).where(eq(projects.id, projectId)).limit(1);
  return row ? toInfo(row) : null;
}

// Hasil membaca ?project= di halaman Uang Muka / Pertanggungjawaban:
// tanpa parameter (atau project tidak ada) = tampilkan kartu pilihan project.
export type ProjectScope = { kind: "picker" } | { kind: "none" } | { kind: "project"; project: ProjectInfo };

// cache(): dipanggil oleh tombol di judul halaman dan isi halaman sekaligus,
// tetapi hanya sekali ke database per permintaan.
export const resolveProjectScope = cache(async (param: string | undefined): Promise<ProjectScope> => {
  if (!param) return { kind: "picker" };
  if (param === NO_PROJECT) return { kind: "none" };
  const project = await getProjectInfo(param);
  return project ? { kind: "project", project } : { kind: "picker" };
});

// Project aktif untuk pilihan "tetapkan project" uang muka lama.
export async function listActiveProjects(): Promise<{ id: string; name: string }[]> {
  await io();
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.status, "ACTIVE"))
    .orderBy(asc(projects.name));
}

// ---------------------------------------------------------------------------
// Kartu pilihan project
// ---------------------------------------------------------------------------

// Hitungan uang muka di satu project, sebatas yang boleh dilihat viewer:
// karyawan hanya miliknya sendiri, OWNER/FINANCE seluruh perusahaan.
export type ProjectStats = {
  total: number;
  active: number; // belum selesai / ditolak / dibatalkan
  pendingApproval: number;
  awaitingDisbursement: number; // disetujui, dana belum diserahkan
  awaitingAcknowledgment: number; // dana sudah cair, karyawan belum konfirmasi
  needFill: number; // diterima karyawan, nota belum dikirim
  needRevision: number; // nota dikembalikan untuk diperbaiki
  toVerify: number; // nota menunggu verifikasi
  returnPending: number; // sisa dana belum dikembalikan
  reimbursePending: number; // kekurangan belum diganti
  closed: number;
  overdue: number; // lewat batas unggah nota, nota belum (lengkap) dikirim
  outstandingAmount: number; // dana beredar
};

export type ProjectCardData = {
  id: string | null; // null = "Tanpa project" (uang muka lama)
  name: string;
  client: string | null;
  icon: ProjectIconKey;
  status: ProjectStatus | null;
  createdAt: Date | null; // null untuk "Tanpa project"
  stats: ProjectStats;
};

const countStatus = (...statuses: AdvanceStatus[]) =>
  sql`count(*) filter (where ${inArray(advanceRequests.status, statuses)})`.mapWith(Number);

const EMPTY_STATS: ProjectStats = {
  total: 0,
  active: 0,
  pendingApproval: 0,
  awaitingDisbursement: 0,
  awaitingAcknowledgment: 0,
  needFill: 0,
  needRevision: 0,
  toVerify: 0,
  returnPending: 0,
  reimbursePending: 0,
  closed: 0,
  overdue: 0,
  outstandingAmount: 0,
};

// Urut dari project terbaru (created_at desc); "Tanpa project" paling akhir.
// Semua project aktif, ditambah project selesai dan "Tanpa project" bila
// viewer punya uang muka di dalamnya (agar riwayat lama tetap terjangkau).
// includeAll: project selesai tanpa uang muka ikut tampil (untuk OWNER, yang
// mengelola semua project).
export async function listProjectCards(filter: { recipientId?: string; includeAll?: boolean }): Promise<ProjectCardData[]> {
  await io();
  const [statRows, projectRows] = await Promise.all([
    db
      .select({
        projectId: advanceRequests.projectId,
        total: sql`count(*)`.mapWith(Number),
        active: sql`count(*) filter (where ${notInArray(advanceRequests.status, ["CLOSED", "REJECTED", "CANCELLED"])})`.mapWith(
          Number,
        ),
        pendingApproval: countStatus("PENDING_APPROVAL"),
        awaitingDisbursement: countStatus("APPROVED"),
        awaitingAcknowledgment: countStatus("DISBURSED"),
        needFill: countStatus("ACKNOWLEDGED"),
        needRevision: countStatus("REVISION_REQUESTED"),
        toVerify: countStatus("SUBMITTED"),
        returnPending: countStatus("RETURN_PENDING"),
        reimbursePending: countStatus("REIMBURSE_PENDING"),
        closed: countStatus("CLOSED"),
        overdue:
          sql`count(*) filter (where ${inArray(advanceRequests.status, [...AWAITING_RECEIPT_STATUSES])} and ${advanceRequests.settlementDueAt} < now())`.mapWith(
            Number,
          ),
        outstandingAmount:
          sql`coalesce(sum(${advanceRequests.amount}) filter (where ${inArray(advanceRequests.status, ["DISBURSED", "ACKNOWLEDGED", "SUBMITTED", "REVISION_REQUESTED"])}), 0)`.mapWith(
            Number,
          ),
      })
      .from(advanceRequests)
      .where(filter.recipientId ? eq(advanceRequests.recipientId, filter.recipientId) : undefined)
      .groupBy(advanceRequests.projectId),
    db
      .select({ ...infoColumns, createdAt: projects.createdAt })
      .from(projects)
      .orderBy(desc(projects.createdAt)),
  ]);

  const stats = new Map<string | null, ProjectStats>(
    statRows.map(({ projectId, ...values }) => [projectId, values]),
  );

  const cards: ProjectCardData[] = projectRows
    .filter((project) => filter.includeAll || project.status === "ACTIVE" || stats.has(project.id))
    .map(({ createdAt, ...project }) => ({ ...toInfo(project), createdAt, stats: stats.get(project.id) ?? EMPTY_STATS }));

  const legacy = stats.get(null);
  if (legacy) {
    cards.push({
      id: null,
      name: "Tanpa project",
      client: null,
      icon: DEFAULT_PROJECT_ICON,
      status: null,
      createdAt: null,
      stats: legacy,
    });
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Halaman kelola project (OWNER)
// ---------------------------------------------------------------------------

export type ProjectForManage = ProjectInfo & {
  contractValue: number | null;
  advanceCount: number;
};

export async function listProjectsForManage(): Promise<ProjectForManage[]> {
  await io();
  const rows = await db
    .select({
      ...infoColumns,
      contractValue: projects.contractValue,
      advanceCount: sql<number>`(select count(*) from ${advanceRequests} where ${advanceRequests.projectId} = ${projects.id})`.mapWith(
        Number,
      ),
    })
    .from(projects)
    // Aktif dulu, lalu urut nama.
    .orderBy(asc(projects.status), asc(projects.name));
  return rows.map((row) => ({ ...toInfo(row), contractValue: row.contractValue, advanceCount: row.advanceCount }));
}

// Isian awal halaman ubah project. Memuat nilai kontrak, jadi pemanggil WAJIB
// sudah memeriksa project:manage (OWNER).
export async function getProjectForEdit(
  projectId: string,
): Promise<(ProjectInfo & { contractValue: number | null }) | null> {
  await io();
  const [row] = await db
    .select({ ...infoColumns, contractValue: projects.contractValue })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ? { ...toInfo(row), contractValue: row.contractValue } : null;
}

// Dipakai Server Action: project aktif yang boleh menerima uang muka baru.
export async function getActiveProject(projectId: string): Promise<ProjectInfo | null> {
  const [row] = await db
    .select(infoColumns)
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.status, "ACTIVE")))
    .limit(1);
  return row ? toInfo(row) : null;
}
