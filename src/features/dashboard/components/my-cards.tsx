// Kartu "milik saya" di Beranda untuk siapa pun yang punya haknya (Karyawan,
// Finance, Admin HR): status absen hari ini, sisa cuti, dan slip gaji terbaru.
// Server Component; tiap kartu mengambil datanya sendiri dan dibungkus
// <Suspense> oleh halaman.

import {
  ArrowRightIcon,
  CalendarCheckIcon,
  ClockIcon,
  DownloadIcon,
  FilePenLineIcon,
  LogInIcon,
  LogOutIcon,
  PlaneIcon,
  ReceiptTextIcon,
  ScanFaceIcon,
  type LucideIcon,
} from "lucide-react";
import { io } from "next/cache";
import Link from "next/link";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { formatLocalClock, localTime } from "@/features/attendance/clock";
import { timezoneLabel } from "@/features/attendance/constants";
import { leavePeriodText } from "@/features/attendance/leave-notifications";
import { getLeaveQuota, listMyLeaves } from "@/features/attendance/leave-queries";
import { getAttendanceSettings, getLatestRecord, getMyFaceProfiles, hasConsent } from "@/features/attendance/queries";
import { formatMinutes, formatWorkDays } from "@/features/attendance/schedule";
import { periodLabel } from "@/features/attendance/review-data";
import { listOwnPayslips } from "@/features/salaries/queries";
import type { CompanyUser } from "@/lib/auth/dal";
import { formatDateOnly, zonedDateString } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { EmptyNote, SectionCard, type TileTone } from "./dashboard-ui";

function CtaButton({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: string }) {
  return (
    <Button size="lg" className="w-full sm:w-auto" nativeButton={false} render={<Link href={href} />}>
      <Icon />
      {children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Absen hari ini
// ---------------------------------------------------------------------------

export async function MyAttendanceCard({ user }: { user: CompanyUser }) {
  const companyId = user.company.id;
  // Cache Components: new Date() wajib setelah io() (lihat io.md).
  await io();
  const now = new Date();
  const [settings, faces, latest] = await Promise.all([
    getAttendanceSettings(companyId),
    getMyFaceProfiles(companyId, user.id),
    getLatestRecord(companyId, user.id),
  ]);
  const workHours = `${formatMinutes(settings.workStartMinute)} – ${formatMinutes(settings.workEndMinute)}`;
  const schedule = `Jam kerja ${workHours}, ${formatWorkDays(settings.workDays).toLowerCase()}`;

  // Foto acuan belum siap → arahkan melengkapinya dulu.
  if (!faces.approved) {
    const consented = faces.latest ? true : await hasConsent(user.id);
    const state: { title: string; text: string; tone: TileTone; cta: string | null } =
      faces.latest?.status === "PENDING"
        ? {
            title: "Foto wajah menunggu persetujuan",
            text: "Owner atau Admin HR sedang memeriksa foto Anda. Setelah disetujui, Anda bisa absen.",
            tone: "amber",
            cta: "Ambil ulang foto",
          }
        : faces.latest?.status === "REJECTED"
          ? {
              title: "Foto wajah ditolak",
              text: faces.latest.rejectReason ? `Alasan: ${faces.latest.rejectReason}` : "Ambil ulang foto Anda.",
              tone: "rose",
              cta: "Ambil ulang foto",
            }
          : {
              title: "Daftarkan foto wajah",
              text: "Foto acuan wajib ada sebelum Anda bisa absen masuk dan pulang.",
              tone: "brand",
              cta: consented ? "Ambil foto wajah" : "Daftar foto wajah",
            };
    return (
      <SectionCard title="Absen hari ini" icon={ScanFaceIcon} tone={state.tone} href="/attendance" hrefLabel="Absensi">
        <div className="flex flex-col gap-1">
          <p className="font-medium">{state.title}</p>
          <p className="text-sm text-muted-foreground">{state.text}</p>
        </div>
        {state.cta && (
          <CtaButton href="/attendance/enroll" icon={ScanFaceIcon}>
            {state.cta}
          </CtaButton>
        )}
      </SectionCard>
    );
  }

  // Sama dengan modeOf() di check-actions.ts.
  const sameDay = !!latest && latest.workDate === localTime(now, latest.timezone).date;
  const mode = !sameDay ? "in" : latest.checkOutAt ? "done" : "out";
  const clock = (at: Date) => `${formatLocalClock(at, latest!.timezone)} ${timezoneLabel(latest!.timezone)}`;

  return (
    <SectionCard
      title="Absen hari ini"
      icon={CalendarCheckIcon}
      tone={mode === "done" ? "emerald" : "brand"}
      href="/attendance"
      hrefLabel="Absensi"
    >
      {mode === "in" ? (
        <>
          <div className="flex flex-col gap-1">
            <p className="font-medium">Anda belum absen masuk</p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ClockIcon className="size-4 shrink-0" />
              {schedule}
            </p>
          </div>
          <CtaButton href="/attendance/check" icon={LogInIcon}>
            Absen masuk
          </CtaButton>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Masuk</p>
              <p className="text-lg font-semibold tabular-nums">{clock(latest!.checkInAt)}</p>
              {latest!.lateMinutes > 0 && (
                <ToneBadge tone="warning" className="mt-1">
                  Terlambat {latest!.lateMinutes} mnt
                </ToneBadge>
              )}
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Pulang</p>
              {latest!.checkOutAt ? (
                <p className="text-lg font-semibold tabular-nums">{clock(latest!.checkOutAt)}</p>
              ) : (
                <p className="text-lg font-semibold text-muted-foreground">Belum</p>
              )}
            </div>
          </div>
          {mode === "out" ? (
            <>
              <p className="text-sm text-muted-foreground">Jangan lupa absen pulang sebelum pukul 23.59.</p>
              <CtaButton href="/attendance/check" icon={LogOutIcon}>
                Absen pulang
              </CtaButton>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Absen hari ini sudah lengkap. Terima kasih.</p>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Sisa cuti
// ---------------------------------------------------------------------------

export async function MyLeaveCard({ user }: { user: CompanyUser }) {
  const companyId = user.company.id;
  await io();
  const today = zonedDateString(new Date());
  const [quota, mine] = await Promise.all([
    getLeaveQuota(companyId, user.id, Number(today.slice(0, 4))),
    listMyLeaves(companyId, user.id),
  ]);
  const waiting = mine.filter((row) => row.status === "PENDING").length;
  const upcoming = mine
    .filter((row) => row.status === "APPROVED" && row.endDate >= today)
    .toSorted((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const share = quota.quota > 0 ? Math.min(100, ((quota.used + quota.pending) / quota.quota) * 100) : 0;

  return (
    <SectionCard title="Cuti & izin" icon={PlaneIcon} tone="indigo" href="/attendance/leave" hrefLabel="Buka">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl leading-none font-semibold tabular-nums">{quota.remaining}</p>
          <p className="mt-1 text-xs text-muted-foreground">hari sisa cuti tahun {quota.year}</p>
        </div>
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          terpakai {quota.used} · menunggu {quota.pending}
          <br />
          dari {quota.quota} hari
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Cuti terpakai"
        aria-valuemin={0}
        aria-valuemax={quota.quota}
        aria-valuenow={Math.min(quota.used, quota.quota)}
      >
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${share}%` }} />
      </div>
      {(waiting > 0 || upcoming) && (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {waiting > 0 && <li>{waiting} pengajuan menunggu persetujuan.</li>}
          {upcoming && (
            <li>
              Cuti terdekat: {upcoming.typeName}, {leavePeriodText(upcoming)}.
            </li>
          )}
        </ul>
      )}
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
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Slip gaji terbaru
// ---------------------------------------------------------------------------

export async function MyPayslipCard({ user }: { user: CompanyUser }) {
  const [latest] = await listOwnPayslips(user.company.id, user.id);
  return (
    <SectionCard title="Slip gaji" icon={ReceiptTextIcon} tone="emerald" href="/payslips" hrefLabel="Semua slip">
      {latest ? (
        <>
          <div>
            <p className="text-xs text-muted-foreground">Gaji bersih {periodLabel(latest.period)}</p>
            <p className="text-3xl leading-none font-semibold tabular-nums">{formatRupiah(latest.netPay)}</p>
            {latest.payDate && (
              <p className="mt-1 text-xs text-muted-foreground">Dibayar {formatDateOnly(latest.payDate)}</p>
            )}
          </div>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            nativeButton={false}
            render={<a href={`/api/payslips/${latest.id}`} />}
          >
            <DownloadIcon />
            Unduh slip (PDF)
          </Button>
        </>
      ) : (
        <EmptyNote>Belum ada slip gaji. Slip muncul setelah penggajian diselesaikan Owner.</EmptyNote>
      )}
    </SectionCard>
  );
}
