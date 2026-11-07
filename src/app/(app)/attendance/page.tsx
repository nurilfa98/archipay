// Halaman /attendance (menu Absensi), BUSINESS-FLOW §18.
// - Pengguna yang wajib absen: absen hari ini (tombol masuk/pulang), riwayat
//   bulan ini, dan status foto acuan wajah.
// - Owner, Admin HR (dan Superadmin, baca saja): pintasan ke absensi hari ini,
//   lokasi absensi, persetujuan foto wajah, dan pengaturan jam kerja.

import {
  CalendarClockIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  ClockIcon,
  LockIcon,
  PlaneIcon,
  LogInIcon,
  LogOutIcon,
  MapPinIcon,
  ScanFaceIcon,
  TimerIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { FilePreview } from "@/components/file-preview";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { localTime } from "@/features/attendance/clock";
import { FaceModelPreloader } from "@/features/attendance/components/face-model-preloader";
import { FaceSubmissionCard } from "@/features/attendance/components/face-submission-card";
import { MyRecordsFeed } from "@/features/attendance/components/my-records-feed";
import { RecordList } from "@/features/attendance/components/record-list";
import { countPendingLeaves } from "@/features/attendance/leave-queries";
import {
  countActiveLocations,
  countPendingFaces,
  getAttendanceSettings,
  getLatestRecord,
  getMyFaceProfiles,
  hasConsent,
  MY_RECORDS_PAGE_SIZE,
  listMyRecordsPage,
} from "@/features/attendance/queries";
import { faceChangeLockedUntil, showFaceSubmission } from "@/features/attendance/constants";
import { formatMinutes, formatWorkDays } from "@/features/attendance/schedule";
import { requireAttendanceAddon } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, formatShortDate, zonedDateString } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

export const metadata: Metadata = {
  title: "Absensi",
};

export default function AttendancePage() {
  return (
    <>
      <PageHeader title="Absensi" description="Absen kerja dengan foto wajah dan lokasi GPS." />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <AttendanceContent />
      </Suspense>
    </>
  );
}

async function AttendanceContent() {
  const user = await requireAttendanceAddon();
  const checksIn = can(user, "attendance:check-in");
  const viewsAll = can(user, "attendance:view-all");
  if (!checksIn && !viewsAll) {
    return <p className="text-sm text-muted-foreground">Anda tidak memiliki akses ke menu Absensi.</p>;
  }

  const companyId = user.company.id;
  // Cache Components: new Date() wajib setelah io(), agar tidak ikut prerender
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md).
  await io();
  const now = new Date();
  const period = zonedDateString(now).slice(0, 7);
  const [settings, faces, consented, locationCount, pendingFaces, latest, records, pendingLeaves] = await Promise.all([
    getAttendanceSettings(companyId),
    checksIn ? getMyFaceProfiles(companyId, user.id) : null,
    checksIn ? hasConsent(user.id) : false,
    viewsAll ? countActiveLocations(companyId) : 0,
    viewsAll ? countPendingFaces(companyId) : 0,
    checksIn ? getLatestRecord(companyId, user.id) : null,
    checksIn ? listMyRecordsPage(companyId, user.id, period) : { rows: [], hasMore: false },
    viewsAll ? countPendingLeaves(companyId) : 0,
  ]);
  // Sama dengan modeOf() di check-actions.ts.
  const sameDay = latest && latest.workDate === localTime(now, latest.timezone).date;
  const mode = !sameDay ? "in" : latest.checkOutAt ? "done" : "out";
  // Kartu "Foto yang diajukan": foto menunggu, atau penolakan. Bila karyawan
  // masih punya foto acuan, penolakan hanya tampil FACE_REJECT_NOTICE_DAYS hari.
  const submission = faces?.latest ?? null;
  const showSubmission = !!faces && showFaceSubmission(faces.approved, faces.latest, now);
  // Ganti foto acuan dibatasi sekali seminggu (FACE_CHANGE_INTERVAL_DAYS).
  const lockedUntil = faces ? faceChangeLockedUntil(faces.approved, faces.latest, now) : null;

  return (
    <>
      {/* Belum absen pulang/masuk hari ini: siapkan model wajah sebelum tombol ditekan. */}
      {checksIn && faces?.approved && mode !== "done" && <FaceModelPreloader />}

      {checksIn && faces?.approved && (
        <Card>
          <CardHeader>
            <CardTitle>Absen hari ini</CardTitle>
            <CardDescription>
              {mode === "in"
                ? "Anda belum absen masuk hari ini."
                : mode === "out"
                  ? "Anda sudah absen masuk. Jangan lupa absen pulang sebelum pukul 23.59."
                  : "Anda sudah absen masuk dan pulang hari ini."}
            </CardDescription>
          </CardHeader>
          {mode !== "done" && (
            <CardContent>
              <Button size="lg" nativeButton={false} render={<Link href="/attendance/check" />}>
                {mode === "in" ? <LogInIcon /> : <LogOutIcon />}
                {mode === "in" ? "Absen masuk" : "Absen pulang"}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* Di atas riwayat: riwayat makin panjang, jangan sampai menu ini terdorong ke bawah. */}
      {checksIn && !viewsAll && (
        <Shortcut
          href="/attendance/leave"
          icon={<PlaneIcon />}
          title="Cuti & izin"
          description="Ajukan cuti, sakit, izin, atau izin datang terlambat / pulang cepat"
        />
      )}

      {checksIn && faces && (
        <Card>
          <CardHeader>
            <CardTitle>Foto acuan wajah Anda</CardTitle>
            <CardDescription>Dipakai untuk mencocokkan wajah Anda saat absen.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <MyFaceStatus
              faces={faces}
              consented={consented}
              submissionShown={showSubmission}
              lockedUntil={lockedUntil}
            />
            <dl className="grid grid-cols-2 gap-2">
              <WorkRule
                icon={<ClockIcon />}
                label="Jam kerja"
                value={`${formatMinutes(settings.workStartMinute)} – ${formatMinutes(settings.workEndMinute)}`}
              />
              <WorkRule
                icon={<TimerIcon />}
                label="Toleransi terlambat"
                value={`${settings.lateToleranceMinutes} menit`}
              />
              <WorkRule
                className="col-span-2"
                icon={<CalendarDaysIcon />}
                label="Hari kerja"
                value={formatWorkDays(settings.workDays)}
              />
            </dl>
          </CardContent>
        </Card>
      )}

      {checksIn && faces && showSubmission && submission && (
        <FaceSubmissionCard submission={submission} hasApproved={!!faces.approved} />
      )}

      {viewsAll && (
        <div className="grid gap-3 md:grid-cols-2">
          <Shortcut
            href="/attendance/leave"
            icon={<PlaneIcon />}
            title="Cuti & izin"
            description={pendingLeaves > 0 ? `${pendingLeaves} menunggu persetujuan` : "Tidak ada yang menunggu"}
            badge={pendingLeaves > 0 ? <ToneBadge tone="warning">{pendingLeaves}</ToneBadge> : null}
          />
          <Shortcut
            href="/attendance/review"
            icon={<ClipboardCheckIcon />}
            title="Review bulanan"
            description="Rekap, sanggahan, bebaskan denda, kunci periode, PDF & Excel"
          />
          <Shortcut
            href="/attendance/today"
            icon={<ClipboardListIcon />}
            title="Absensi hari ini"
            description="Siapa sudah masuk, terlambat, atau belum absen"
          />
          <Shortcut
            href="/attendance/locations"
            icon={<MapPinIcon />}
            title="Lokasi absensi"
            description={locationCount > 0 ? `${locationCount} lokasi aktif` : "Belum ada lokasi"}
          />
          <Shortcut
            href="/attendance/faces"
            icon={<ScanFaceIcon />}
            title="Foto wajah"
            description={pendingFaces > 0 ? `${pendingFaces} menunggu persetujuan` : "Tidak ada yang menunggu"}
            badge={pendingFaces > 0 ? <ToneBadge tone="warning">{pendingFaces}</ToneBadge> : null}
          />
          {can(user, "settings:view") && (
            <Shortcut
              href="/settings#absensi"
              icon={<CalendarClockIcon />}
              title="Jam kerja & denda"
              description={
                settings.latePenaltyAmount > 0
                  ? `Denda ${formatRupiah(settings.latePenaltyAmount)} per keterlambatan`
                  : "Denda keterlambatan belum diatur"
              }
            />
          )}
        </div>
      )}

      {/* Paling bawah: panjangnya bertambah sepanjang bulan, 10 dulu lalu dimuat saat di-scroll. */}
      {checksIn && faces?.approved && (
        <section className="flex flex-col gap-3" aria-labelledby="my-records">
          <h2 id="my-records" className="font-medium">
            Riwayat absen bulan ini
          </h2>
          {records.rows.length === 0 ? (
            <RecordList records={[]} now={now} emptyText="Belum ada absen bulan ini." />
          ) : (
            <MyRecordsFeed
              initial={<RecordList records={records.rows} now={now} emptyText="" />}
              period={period}
              initialHasMore={records.hasMore}
              pageSize={MY_RECORDS_PAGE_SIZE}
            />
          )}
        </section>
      )}
    </>
  );
}

function MyFaceStatus({
  faces,
  consented,
  submissionShown,
  lockedUntil,
}: {
  faces: Awaited<ReturnType<typeof getMyFaceProfiles>>;
  consented: boolean;
  // Kartu "Foto yang diajukan" sedang tampil di bawahnya: statusnya, alasan
  // penolakan, dan tombol ambil ulang ada di sana.
  submissionShown: boolean;
  // Foto acuan baru boleh diganti lagi mulai waktu ini (batas sekali seminggu).
  lockedUntil: Date | null;
}) {
  const { approved, latest } = faces;
  const photoClass = "size-[111px] shrink-0 rounded-xl";

  return (
    <div className="flex items-center gap-4">
      {approved ? (
        // Klik foto → pratinjau mengambang (components/file-preview.tsx).
        <FilePreview
          src={`/api/attendance/faces/${approved.id}/photo`}
          isPdf={false}
          title="Foto acuan wajah Anda"
          className={`group block ${photoClass} cursor-zoom-in overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- file privat lewat route berizin */}
          <img
            src={`/api/attendance/faces/${approved.id}/photo`}
            alt="Foto acuan wajah Anda"
            className="size-full bg-muted object-cover object-[50%_30%] transition-transform duration-200 group-hover:scale-105"
          />
        </FilePreview>
      ) : (
        <div className={`flex ${photoClass} items-center justify-center border border-dashed bg-muted/50`}>
          <ScanFaceIcon className="size-9 text-muted-foreground" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        {approved ? (
          <ToneBadge tone="success">Siap absen</ToneBadge>
        ) : latest?.status === "PENDING" ? (
          <ToneBadge tone="warning">Menunggu persetujuan</ToneBadge>
        ) : latest?.status === "REJECTED" ? (
          <ToneBadge tone="danger">Ditolak</ToneBadge>
        ) : (
          <ToneBadge tone="pending">Belum terdaftar</ToneBadge>
        )}
        <p className="text-sm text-muted-foreground">
          {approved
            ? `Disetujui ${formatShortDate(approved.reviewedAt ?? approved.createdAt)}`
            : latest?.status === "PENDING"
              ? "Sedang diperiksa Owner atau Admin HR."
              : latest?.status === "REJECTED"
                ? "Foto ditolak. Ambil ulang foto Anda."
                : "Daftarkan foto wajah agar bisa absen."}
        </p>
        {!submissionShown && !approved && !latest && (
          <Button size="sm" nativeButton={false} render={<Link href="/attendance/enroll" />}>
            <ScanFaceIcon />
            {consented ? "Ambil foto wajah" : "Daftar foto wajah"}
          </Button>
        )}
        {!submissionShown && approved && !lockedUntil && (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/attendance/enroll" />}>
            Ganti foto wajah
          </Button>
        )}
        {!submissionShown && approved && lockedUntil && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <LockIcon className="mt-0.5 size-3.5 shrink-0" />
            Terkunci sampai {formatDateTime(lockedUntil)}.
          </p>
        )}
      </div>
    </div>
  );
}

function WorkRule({
  icon,
  label,
  value,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 rounded-lg bg-muted/60 px-3 py-2 ${className ?? ""}`}>
      <span className="text-muted-foreground [&>svg]:size-4">{icon}</span>
      <div className="flex min-w-0 flex-col">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}

function Shortcut({
  href,
  icon,
  title,
  description,
  badge,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  badge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted [&>svg]:size-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand [&>svg]:size-5">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
      {badge}
      <ChevronRightIcon className="text-muted-foreground" />
    </Link>
  );
}
