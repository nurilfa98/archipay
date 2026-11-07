// Halaman /attendance/overtime: lembur di hari libur (BUSINESS-FLOW §24).
// - Pengguna yang wajib absen: ajukan lembur, daftar lembur sendiri (bisa dibatalkan;
//   penugasan bisa ditolak dengan "Tidak bisa hadir").
// - Owner & Admin HR (Superadmin baca saja): menunggu persetujuan (Admin HR setelah
//   waktu delegasi cuti), tugaskan lembur, dan riwayat terbaru.

import { Clock3Icon } from "lucide-react";
import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignOvertimeButton, RequestOvertimeButton } from "@/features/attendance/components/overtime-dialogs";
import { OvertimeList, type OvertimeListRow } from "@/features/attendance/components/overtime-list";
import { overtimeDecisionRight, overtimeDelegatedAt } from "@/features/attendance/overtime-rules";
import {
  formatOvertimeHours,
  OVERTIME_SOURCE_LABELS,
  OVERTIME_STATUS_LABELS,
  OVERTIME_STATUS_TONES,
} from "@/features/attendance/overtime";
import {
  getOvertimeSettings,
  listCompanyOvertime,
  listMyOvertime,
  type OvertimeRow,
  type OvertimeSettings,
} from "@/features/attendance/overtime-queries";
import { listApprovedFaceIds, listCheckInPeople } from "@/features/attendance/queries";
import { formatMinutes } from "@/features/attendance/schedule";
import { requireAttendanceAddon, type CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateOnly, formatDateTime, zonedDateString } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Lembur",
};

export default function OvertimePage() {
  return (
    <>
      <PageHeader
        title="Lembur"
        description="Absen di hari libur hanya bisa dengan izin lembur. Jam lembur dihitung dari absen yang sebenarnya."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OvertimeContent />
      </Suspense>
    </>
  );
}

async function OvertimeContent() {
  const user = await requireAttendanceAddon();
  const checksIn = can(user, "attendance:check-in");
  const viewsAll = can(user, "attendance:view-all");
  if (!checksIn && !viewsAll) {
    return <p className="text-sm text-muted-foreground">Anda tidak memiliki akses ke menu Lembur.</p>;
  }

  const companyId = user.company.id;
  // Cache Components: new Date() wajib setelah io(), agar tidak ikut prerender
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md).
  await io();
  const now = new Date();
  const today = zonedDateString(now);
  const settings = await getOvertimeSettings(companyId);
  const assigns = can(user, "overtime:assign");
  const [mine, pending, recent, people, photos] = await Promise.all([
    checksIn ? listMyOvertime(companyId, user.id) : [],
    viewsAll ? listCompanyOvertime(companyId, ["PENDING"]) : [],
    viewsAll ? listCompanyOvertime(companyId, ["APPROVED", "REJECTED", "CANCELLED", "DECLINED"], 30) : [],
    assigns ? listCheckInPeople(companyId) : [],
    viewsAll ? listApprovedFaceIds(companyId) : new Map<string, string>(),
  ]);

  const toRow = (row: OvertimeRow, own: boolean) => buildRow(row, { user, settings, now, own, photos });

  return (
    <>
      {checksIn && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3Icon className="size-5 text-brand" />
              Lembur di hari libur
            </CardTitle>
            <CardDescription>
              Ajukan sebelum atau di hari H, lalu tunggu persetujuan. Setelah disetujui, tombol absen aktif di hari
              libur itu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestOvertimeButton today={today} />
          </CardContent>
        </Card>
      )}

      {viewsAll && (
        <section className="flex flex-col gap-3" aria-labelledby="pending-overtime">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="pending-overtime" className="font-medium">
              Menunggu persetujuan ({pending.length})
            </h2>
            {assigns && (
              <AssignOvertimeButton
                today={today}
                people={people.filter((person) => person.id !== user.id).map(({ id, fullName }) => ({ id, fullName }))}
              />
            )}
          </div>
          <OvertimeList
            rows={pending.map((row) => toRow(row, false))}
            showName
            emptyText="Tidak ada pengajuan lembur yang menunggu."
          />
        </section>
      )}

      {checksIn && (
        <section className="flex flex-col gap-3" aria-labelledby="my-overtime">
          <h2 id="my-overtime" className="font-medium">
            Lembur saya
          </h2>
          <OvertimeList rows={mine.map((row) => toRow(row, true))} showName={false} emptyText="Belum ada lembur." />
        </section>
      )}

      {viewsAll && (
        <section className="flex flex-col gap-3" aria-labelledby="recent-overtime">
          <h2 id="recent-overtime" className="font-medium">
            Riwayat terbaru
          </h2>
          <OvertimeList
            rows={recent.map((row) => toRow(row, false))}
            showName
            emptyText="Belum ada lembur yang diproses."
          />
        </section>
      )}
    </>
  );
}

function buildRow(
  row: OvertimeRow,
  ctx: { user: CompanyUser; settings: OvertimeSettings; now: Date; own: boolean; photos: Map<string, string> },
): OvertimeListRow {
  const { user, settings, now, own, photos } = ctx;
  const active = row.status === "PENDING" || row.status === "APPROVED";
  const right = row.status === "PENDING" ? overtimeDecisionRight(user, row, settings, now) : null;

  let decideHint: string | null = null;
  if (row.status === "PENDING" && !right && row.userId !== user.id && can(user, "leave:approve-delegated")) {
    decideHint = settings.overtimeDelegationEnabled
      ? `Menunggu Owner. Anda bisa memprosesnya mulai ${formatDateTime(overtimeDelegatedAt(row, settings))}.`
      : "Menunggu Owner (delegasi ke Admin HR nonaktif).";
  }

  // Pembatalan: pengaju untuk pengajuannya sendiri, Owner/Admin HR untuk lembur orang lain.
  // Yang sudah dipakai absen tidak bisa dibatalkan.
  const locked = row.status === "APPROVED" && row.attended;
  const ownRequest = own && row.userId === user.id && row.source === "REQUEST";
  const manager = row.userId !== user.id && (can(user, "overtime:assign") || can(user, "leave:approve"));
  const canCancel = active && !locked && (ownRequest || manager);
  const canDecline =
    own && row.userId === user.id && row.source === "ASSIGNED" && row.status === "APPROVED" && !row.attended;

  const decision = row.status === "REJECTED" ? "Ditolak" : "Disetujui";
  const decidedText =
    row.decidedAt &&
    row.decidedByName &&
    row.source === "REQUEST" &&
    (row.status === "APPROVED" || row.status === "REJECTED")
      ? `${decision} ${row.decidedByName}, ${formatDateTime(row.decidedAt)}${row.decidedByDelegate ? " (delegasi Admin HR)" : ""}`
      : null;

  return {
    id: row.id,
    userName: row.userName,
    photoId: photos.get(row.userId) ?? null,
    dateText: formatDateOnly(row.workDate),
    timeText: `${formatMinutes(row.startMinute)} – ${formatMinutes(row.endMinute)}`,
    reason: row.reason,
    sourceText:
      row.source === "ASSIGNED"
        ? `${OVERTIME_SOURCE_LABELS.ASSIGNED} ${row.requestedByName}`
        : OVERTIME_SOURCE_LABELS.REQUEST,
    statusLabel: OVERTIME_STATUS_LABELS[row.status],
    tone: OVERTIME_STATUS_TONES[row.status],
    decidedText,
    rejectReason: row.rejectReason,
    declineReason: row.declineReason,
    workedText:
      row.workedMinutes === null
        ? null
        : row.workedMinutes > 0
          ? `Terhitung ${formatOvertimeHours(row.workedMinutes)}`
          : "Belum ada jam terhitung",
    canDecide: !!right,
    decideHint,
    canCancel,
    canDecline,
  };
}
