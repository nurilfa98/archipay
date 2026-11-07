// Halaman /attendance/leave: cuti & izin (BUSINESS-FLOW §19).
// - Pengguna yang wajib absen: sisa kuota, ajukan, daftar pengajuan sendiri
//   (bisa dibatalkan).
// - Owner & Admin HR (Superadmin baca saja): menunggu persetujuan (Admin HR
//   setelah waktu delegasi), riwayat terbaru, dan sisa cuti per karyawan
//   (Owner bisa mengubah kuota khusus).

import { ArrowRightIcon, FilePenLineIcon } from "lucide-react";
import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";
import type { Tone } from "@/components/tone-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveList, type LeaveListRow } from "@/features/attendance/components/leave-list";
import { LeaveQuotaTable } from "@/features/attendance/components/leave-settings";
import { LEAVE_STATUS_LABELS, type LeaveStatus } from "@/features/attendance/constants";
import { leavePeriodText } from "@/features/attendance/leave-notifications";
import {
  getLeaveQuota,
  getLeaveSettings,
  listCompanyLeaves,
  listMyLeaves,
  listQuotaPeople,
  type LeaveRequestRow,
  type LeaveSettings,
} from "@/features/attendance/leave-queries";
import { delegatedAt, leaveDecisionRight } from "@/features/attendance/leave-rules";
import { listApprovedFaceIds, listCheckInPeople } from "@/features/attendance/queries";
import { requireAttendanceAddon, type CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, zonedDateString } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Cuti & Izin",
};

const STATUS_TONES: Record<LeaveStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "pending",
};

export default function LeavePage() {
  return (
    <>
      <PageHeader
        title="Cuti & izin"
        description="Cuti/izin yang disetujui tampil di rekap absensi, sehingga tidak dihitung tidak hadir."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <LeaveContent />
      </Suspense>
    </>
  );
}

async function LeaveContent() {
  const user = await requireAttendanceAddon();
  const checksIn = can(user, "attendance:check-in");
  const viewsAll = can(user, "attendance:view-all");
  if (!checksIn && !viewsAll) {
    return <p className="text-sm text-muted-foreground">Anda tidak memiliki akses ke menu Cuti & izin.</p>;
  }

  const companyId = user.company.id;
  // Cache Components: new Date() wajib setelah io(), agar tidak ikut prerender
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md).
  await io();
  const now = new Date();
  const today = zonedDateString(now);
  const year = Number(today.slice(0, 4));
  const settings = await getLeaveSettings(companyId);
  const [quota, mine, pending, recent, people, photos] = await Promise.all([
    checksIn ? getLeaveQuota(companyId, user.id, year) : null,
    checksIn ? listMyLeaves(companyId, user.id) : [],
    viewsAll ? listCompanyLeaves(companyId, ["PENDING"]) : [],
    viewsAll ? listCompanyLeaves(companyId, ["APPROVED", "REJECTED", "CANCELLED"], 30) : [],
    viewsAll ? listCheckInPeople(companyId) : [],
    viewsAll ? listApprovedFaceIds(companyId) : new Map<string, string>(),
  ]);
  const [quotaPeople, quotas] = await Promise.all([
    listQuotaPeople(
      companyId,
      people.map((person) => person.id),
    ),
    Promise.all(people.map((person) => getLeaveQuota(companyId, person.id, year))),
  ]);
  const quotaById = new Map(people.map((person, index) => [person.id, quotas[index]]));
  const canSetQuota = can(user, "attendance:configure");

  const toRow = (row: LeaveRequestRow, own: boolean) => buildRow(row, { user, settings, now, today, own, photos });

  return (
    <>
      {checksIn && quota && (
        <Card>
          <CardHeader>
            <CardTitle>Sisa cuti tahunan {year}</CardTitle>
            <CardDescription>
              {quota.remaining} dari {quota.quota} hari kerja (terpakai {quota.used}, menunggu persetujuan{" "}
              {quota.pending}). Sisa tidak dibawa ke tahun berikutnya.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="brand"
              size="lg"
              className="group/cta w-full sm:w-auto"
              nativeButton={false}
              render={<Link href="/attendance/leave/new" />}
            >
              <FilePenLineIcon />
              Ajukan cuti / izin
              <ArrowRightIcon className="transition-transform group-hover/cta:translate-x-0.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {viewsAll && (
        <section className="flex flex-col gap-3" aria-labelledby="pending-leaves">
          <h2 id="pending-leaves" className="font-medium">
            Menunggu persetujuan ({pending.length})
          </h2>
          <LeaveList
            rows={pending.map((row) => toRow(row, false))}
            showName
            emptyText="Tidak ada pengajuan yang menunggu."
          />
        </section>
      )}

      {checksIn && (
        <section className="flex flex-col gap-3" aria-labelledby="my-leaves">
          <h2 id="my-leaves" className="font-medium">
            Pengajuan saya
          </h2>
          <LeaveList rows={mine.map((row) => toRow(row, true))} showName={false} emptyText="Belum ada pengajuan." />
        </section>
      )}

      {viewsAll && (
        <section className="flex flex-col gap-3" aria-labelledby="recent-leaves">
          <h2 id="recent-leaves" className="font-medium">
            Riwayat terbaru
          </h2>
          <LeaveList
            rows={recent.map((row) => toRow(row, false))}
            showName
            emptyText="Belum ada pengajuan yang diproses."
          />
        </section>
      )}

      {viewsAll && (
        <section className="flex flex-col gap-3" aria-labelledby="quota-people">
          <h2 id="quota-people" className="font-medium">
            Sisa cuti tahunan {year} per karyawan
          </h2>
          {canSetQuota && (
            <p className="text-sm text-muted-foreground">
              Isi kuota khusus bila berbeda dari kuota perusahaan ({settings.annualLeaveQuota} hari); kosongkan untuk ikut
              kuota perusahaan.
            </p>
          )}
          <LeaveQuotaTable
            companyQuota={settings.annualLeaveQuota}
            canEdit={canSetQuota}
            rows={quotaPeople.map((person) => ({
              ...person,
              ...quotaById.get(person.userId)!,
              photoId: photos.get(person.userId) ?? null,
            }))}
          />
        </section>
      )}
    </>
  );
}

function buildRow(
  row: LeaveRequestRow,
  ctx: {
    user: CompanyUser;
    settings: LeaveSettings;
    now: Date;
    today: string;
    own: boolean;
    photos: Map<string, string>;
  },
): LeaveListRow {
  const { user, settings, now, today, own, photos } = ctx;
  const right = row.status === "PENDING" ? leaveDecisionRight(user, row, settings, now) : null;
  let decideHint: string | null = null;
  if (row.status === "PENDING" && !right && row.userId !== user.id && can(user, "leave:approve-delegated")) {
    decideHint = settings.leaveDelegationEnabled
      ? `Menunggu Owner. Anda bisa memprosesnya mulai ${formatDateTime(delegatedAt(row, settings))}.`
      : "Menunggu Owner (delegasi ke Admin HR nonaktif).";
  }

  let cancel: LeaveListRow["cancel"] = null;
  if (own && row.status === "PENDING") cancel = { kind: "whole" };
  if (own && row.status === "APPROVED" && row.endDate >= today) {
    const first = row.startDate > today ? row.startDate : today;
    cancel =
      row.kind === "FULL_DAY" && row.startDate < row.endDate
        ? { kind: "from-date", min: first, max: row.endDate, defaultValue: first }
        : { kind: "whole" };
  }

  const decision = row.status === "REJECTED" ? "Ditolak" : "Disetujui";
  return {
    id: row.id,
    number: row.number,
    userName: row.userName,
    photoId: photos.get(row.userId) ?? null,
    typeName: row.typeName,
    periodText: leavePeriodText(row),
    reason: row.reason,
    statusLabel: LEAVE_STATUS_LABELS[row.status],
    tone: STATUS_TONES[row.status],
    paid: row.isPaid,
    hasAttachment: row.hasAttachment,
    attachmentIsPdf: row.attachmentIsPdf,
    decidedText:
      row.decidedAt && row.decidedByName
        ? `${decision} ${row.decidedByName}, ${formatDateTime(row.decidedAt)}${row.decidedByDelegate ? " (delegasi Admin HR)" : ""}`
        : null,
    rejectReason: row.rejectReason,
    canDecide: !!right,
    decideHint,
    cancel,
  };
}
