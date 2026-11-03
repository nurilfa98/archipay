// Halaman /attendance (menu Absensi), BUSINESS-FLOW §18.
// - Pengguna yang wajib absen: absen hari ini (tombol masuk/pulang), riwayat
//   bulan ini, dan status foto acuan wajah.
// - Owner, Admin HR (dan Superadmin, baca saja): pintasan ke absensi hari ini,
//   lokasi absensi, persetujuan foto wajah, dan pengaturan jam kerja.

import {
  CalendarClockIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  PlaneIcon,
  LogInIcon,
  LogOutIcon,
  MapPinIcon,
  ScanFaceIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { localTime } from "@/features/attendance/clock";
import { RecordList } from "@/features/attendance/components/record-list";
import { countPendingLeaves } from "@/features/attendance/leave-queries";
import {
  countActiveLocations,
  countPendingFaces,
  getAttendanceSettings,
  getLatestRecord,
  getMyFaceProfiles,
  hasConsent,
  listMyRecords,
} from "@/features/attendance/queries";
import { formatMinutes, formatWorkDays } from "@/features/attendance/schedule";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, zonedDateString } from "@/lib/dates";
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
  const user = await verifySession();
  const checksIn = can(user, "attendance:check-in");
  const viewsAll = can(user, "attendance:view-all");
  if (!checksIn && !viewsAll) {
    return <p className="text-sm text-muted-foreground">Anda tidak memiliki akses ke menu Absensi.</p>;
  }

  const companyId = user.company.id;
  const now = new Date();
  const [settings, faces, consented, locationCount, pendingFaces, latest, records, pendingLeaves] = await Promise.all([
    getAttendanceSettings(companyId),
    checksIn ? getMyFaceProfiles(companyId, user.id) : null,
    checksIn ? hasConsent(user.id) : false,
    viewsAll ? countActiveLocations(companyId) : 0,
    viewsAll ? countPendingFaces(companyId) : 0,
    checksIn ? getLatestRecord(companyId, user.id) : null,
    checksIn ? listMyRecords(companyId, user.id, zonedDateString(now).slice(0, 7)) : [],
    viewsAll ? countPendingLeaves(companyId) : 0,
  ]);
  // Sama dengan modeOf() di check-actions.ts.
  const sameDay = latest && latest.workDate === localTime(now, latest.timezone).date;
  const mode = !sameDay ? "in" : latest.checkOutAt ? "done" : "out";

  return (
    <>
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

      {checksIn && faces && (
        <Card>
          <CardHeader>
            <CardTitle>Foto acuan wajah Anda</CardTitle>
            <CardDescription>
              Jam kerja {formatMinutes(settings.workStartMinute)} – {formatMinutes(settings.workEndMinute)},{" "}
              {formatWorkDays(settings.workDays).toLowerCase()}. Toleransi terlambat {settings.lateToleranceMinutes}{" "}
              menit.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <MyFaceStatus faces={faces} consented={consented} />
          </CardContent>
        </Card>
      )}

      {checksIn && faces?.approved && (
        <section className="flex flex-col gap-3" aria-labelledby="my-records">
          <h2 id="my-records" className="font-medium">
            Riwayat absen bulan ini
          </h2>
          <RecordList records={records} now={now} emptyText="Belum ada absen bulan ini." />
        </section>
      )}

      {checksIn && !viewsAll && (
        <Shortcut
          href="/attendance/leave"
          icon={<PlaneIcon />}
          title="Cuti & izin"
          description="Ajukan cuti, sakit, izin, atau izin datang terlambat / pulang cepat"
        />
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
    </>
  );
}

function MyFaceStatus({
  faces,
  consented,
}: {
  faces: Awaited<ReturnType<typeof getMyFaceProfiles>>;
  consented: boolean;
}) {
  const { approved, latest } = faces;
  const enrollButton = (label: string) => (
    <Button nativeButton={false} render={<Link href="/attendance/enroll" />}>
      <ScanFaceIcon />
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {approved && (
        // eslint-disable-next-line @next/next/no-img-element -- file privat lewat route berizin
        <img
          src={`/api/attendance/faces/${approved.id}/photo`}
          alt="Foto acuan wajah Anda"
          className="size-24 rounded-lg bg-muted object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {approved ? (
            <ToneBadge tone="success">Siap absen</ToneBadge>
          ) : latest?.status === "PENDING" ? (
            <ToneBadge tone="warning">Menunggu persetujuan</ToneBadge>
          ) : latest?.status === "REJECTED" ? (
            <ToneBadge tone="danger">Ditolak</ToneBadge>
          ) : (
            <ToneBadge tone="pending">Belum terdaftar</ToneBadge>
          )}
          {latest?.status === "PENDING" && approved && (
            <span className="text-sm text-muted-foreground">Foto pengganti sedang diperiksa.</span>
          )}
        </div>
        {latest?.status === "PENDING" && (
          <p className="text-sm text-muted-foreground">
            Dikirim {formatDateTime(latest.createdAt)}. Owner atau Admin HR akan memeriksanya.
          </p>
        )}
        {latest?.status === "REJECTED" && latest.rejectReason && (
          <p className="text-sm text-destructive">Alasan: {latest.rejectReason}</p>
        )}
        <div>
          {!approved && !latest && enrollButton(consented ? "Ambil foto wajah" : "Daftar foto wajah")}
          {latest?.status === "REJECTED" && enrollButton("Ambil ulang foto")}
          {latest?.status === "PENDING" && enrollButton("Ambil ulang foto")}
          {approved && !latest && (
            <Button variant="outline" nativeButton={false} render={<Link href="/attendance/enroll" />}>
              Ganti foto wajah
            </Button>
          )}
        </div>
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
