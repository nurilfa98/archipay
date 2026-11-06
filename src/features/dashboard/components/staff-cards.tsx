// Kartu kerja di Beranda untuk Admin HR dan Finance (Server Component).
// - AttendanceOverviewCard (attendance:view-all): ringkasan absensi hari ini
//   + foto wajah dan cuti/izin yang menunggu.
// - PayrollWorkCard (payroll:view / salary:prepare): sisa uang muka yang
//   menunggu dipotong dari gaji dan status penggajian bulan ini.

import {
  BanknoteIcon,
  ClockAlertIcon,
  PlaneIcon,
  ScanFaceIcon,
  UserCheckIcon,
  UserXIcon,
  WalletCardsIcon,
} from "lucide-react";
import { io } from "next/cache";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { listFullDayLeavesOn, countPendingLeaves } from "@/features/attendance/leave-queries";
import { countPendingFaces, listCheckInPeople, listRecordsOnDate } from "@/features/attendance/queries";
import { periodLabel } from "@/features/attendance/review-data";
import { listPayrollCandidates } from "@/features/payroll/queries";
import { RUN_STATUS_LABELS, RUN_STATUS_TONES } from "@/features/salaries/constants";
import { listRuns } from "@/features/salaries/queries";
import type { CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateOnly, zonedDateString } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import Link from "next/link";
import { EmptyNote, LinkRow, SectionCard, StatTile } from "./dashboard-ui";

// ---------------------------------------------------------------------------
// Admin HR: absensi hari ini
// ---------------------------------------------------------------------------

export async function AttendanceOverviewCard({ user }: { user: CompanyUser }) {
  const companyId = user.company.id;
  await io();
  const today = zonedDateString(new Date());
  const canApproveFaces = can(user, "attendance:approve-face");
  const [people, records, leaves, pendingFaces, pendingLeaves] = await Promise.all([
    listCheckInPeople(companyId),
    listRecordsOnDate(companyId, today),
    listFullDayLeavesOn(companyId, today),
    canApproveFaces ? countPendingFaces(companyId) : 0,
    countPendingLeaves(companyId),
  ]);
  const checkedIn = new Set(records.map((record) => record.userId));
  const leaveUsers = new Set(leaves.map((leave) => leave.userId));
  const onLeave = people.filter((person) => !checkedIn.has(person.id) && leaveUsers.has(person.id)).length;
  const absent = people.filter((person) => !checkedIn.has(person.id) && !leaveUsers.has(person.id)).length;
  const late = records.filter((record) => record.lateMinutes > 0).length;

  return (
    <SectionCard
      title="Absensi hari ini"
      icon={UserCheckIcon}
      tone="emerald"
      href="/attendance/today"
      hrefLabel="Detail"
    >
      <p className="-mt-1 text-sm text-muted-foreground">
        {formatDateOnly(today)} · {records.length} dari {people.length} orang sudah absen masuk.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          icon={UserCheckIcon}
          label="Sudah absen"
          value={records.length}
          tone="emerald"
          href="/attendance/today"
        />
        <StatTile icon={ClockAlertIcon} label="Terlambat" value={late} tone="amber" href="/attendance/today" />
        <StatTile icon={PlaneIcon} label="Cuti / izin" value={onLeave} tone="indigo" href="/attendance/today" />
        <StatTile icon={UserXIcon} label="Belum absen" value={absent} tone="rose" href="/attendance/today" />
      </div>
      <div className="flex flex-col gap-2">
        {canApproveFaces && (
          <LinkRow
            href="/attendance/faces"
            icon={ScanFaceIcon}
            tone={pendingFaces > 0 ? "amber" : "slate"}
            title="Foto wajah"
            description={pendingFaces > 0 ? "Menunggu persetujuan Anda" : "Tidak ada yang menunggu"}
            trailing={pendingFaces > 0 ? <ToneBadge tone="warning">{pendingFaces}</ToneBadge> : null}
          />
        )}
        <LinkRow
          href="/attendance/leave"
          icon={PlaneIcon}
          tone={pendingLeaves > 0 ? "amber" : "slate"}
          title="Cuti & izin"
          description={pendingLeaves > 0 ? "Pengajuan menunggu diproses" : "Tidak ada yang menunggu"}
          trailing={pendingLeaves > 0 ? <ToneBadge tone="warning">{pendingLeaves}</ToneBadge> : null}
        />
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Finance: potong gaji & penggajian
// ---------------------------------------------------------------------------

export async function PayrollWorkCard({ user }: { user: CompanyUser }) {
  const companyId = user.company.id;
  await io();
  const thisMonth = zonedDateString(new Date()).slice(0, 7);
  const [candidates, runs] = await Promise.all([
    can(user, "payroll:view") ? listPayrollCandidates(companyId) : null,
    can(user, "salary:prepare") ? listRuns(companyId) : null,
  ]);
  const outstanding = candidates?.reduce((sum, row) => sum + row.outstanding, 0) ?? 0;
  // Penggajian bulan ini; kalau belum ada, tampilkan yang terakhir dibuat.
  const run = runs?.find((item) => item.period === thisMonth) ?? runs?.[0] ?? null;

  return (
    <SectionCard title="Gaji & potongan" icon={WalletCardsIcon} tone="indigo">
      <div className="flex flex-col gap-2">
        {candidates && (
          <LinkRow
            href="/payroll-deductions"
            icon={WalletCardsIcon}
            tone={candidates.length > 0 ? "amber" : "slate"}
            title="Potong Gaji"
            description={
              candidates.length > 0
                ? `${candidates.length} sisa uang muka · ${formatRupiah(outstanding)} menunggu dipotong`
                : "Tidak ada sisa uang muka yang perlu dipotong"
            }
            trailing={candidates.length > 0 ? <ToneBadge tone="warning">{candidates.length}</ToneBadge> : null}
          />
        )}
        {runs && (
          <LinkRow
            href={run ? `/payroll/${run.period}` : "/payroll"}
            icon={BanknoteIcon}
            tone={run?.status === "FINALIZED" ? "emerald" : "indigo"}
            title={run ? `Penggajian ${periodLabel(run.period)}` : "Penggajian"}
            description={
              run
                ? `${run.people} karyawan · ${formatRupiah(run.totalNet)}${run.payDate ? ` · dibayar ${formatDateOnly(run.payDate)}` : ""}`
                : `Belum ada penggajian. Buat untuk ${periodLabel(thisMonth)}.`
            }
            trailing={
              run ? <ToneBadge tone={RUN_STATUS_TONES[run.status]}>{RUN_STATUS_LABELS[run.status]}</ToneBadge> : null
            }
          />
        )}
      </div>
      {runs && run && run.period !== thisMonth && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          <span>Penggajian {periodLabel(thisMonth)} belum dibuat.</span>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/payroll" />}>
            Buat
          </Button>
        </div>
      )}
      {!candidates && !runs && <EmptyNote>Tidak ada data untuk ditampilkan.</EmptyNote>}
    </SectionCard>
  );
}
