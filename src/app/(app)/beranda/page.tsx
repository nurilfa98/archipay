// Halaman Beranda (/beranda): ringkasan pekerjaan sesuai role, dibuka dari
// kotak menu di /. Header sudah disediakan oleh (app)/layout.tsx, jadi page
// cukup berisi konten halaman ini.
//
// Polanya sama dengan halaman lain: judul statis di luar <Suspense>, bagian
// yang membaca user & database di dalamnya. Setiap kartu punya <Suspense>
// sendiri, sehingga kartu yang cepat tidak menunggu yang lambat.
//
// - Owner (project:view-finance): keuangan per proyek + uang muka terbaru.
// - Finance: tugas (verifikasi, pencairan, pengembalian), ringkasan uang muka
//   perusahaan, potong gaji & penggajian.
// - Admin HR: absensi hari ini, foto wajah dan cuti/izin yang menunggu.
// - Karyawan: absen hari ini, tugas milik sendiri, uang muka sendiri, sisa
//   cuti, dan slip gaji terbaru.
// Satu user bisa punya beberapa role: kartunya digabung menurut permission.
// Kartu yang bergantung pada add-on (Absensi, Penggajian) hilang sendiri bila
// perusahaan belum berlangganan (can() sudah memeriksa add-on).

import { ArrowRightIcon, CompassIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvanceSummaryCards } from "@/features/advances/components/advance-summary-cards";
import { RecentAdvancesTable } from "@/features/advances/components/recent-advances-table";
import { getAdvanceSummary, listAdvances } from "@/features/advances/queries";
import { ActionNeeded } from "@/features/dashboard/components/action-needed";
import { DashboardHero } from "@/features/dashboard/components/dashboard-hero";
import { LinkRow, SectionCard } from "@/features/dashboard/components/dashboard-ui";
import { MyAttendanceCard, MyLeaveCard, MyPayslipCard } from "@/features/dashboard/components/my-cards";
import { AttendanceOverviewCard, PayrollWorkCard } from "@/features/dashboard/components/staff-cards";
import { OwnerDashboard } from "@/features/projects/components/owner-dashboard";
import { verifySession, type CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Beranda",
};

const RECENT_LIMIT = 5;

export default function BerandaPage() {
  return (
    <>
      <PageHeader title="Beranda" description="Ringkasan pekerjaan Anda." />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const user = await verifySession();
  // Owner (dan Superadmin yang membuka perusahaan) melihat keuangan per proyek.
  if (can(user, "project:view-finance")) return <OwnerView user={user} />;

  const viewsAdvances = can(user, "advance:view-own");
  const viewsAllAdvances = can(user, "advance:view-all");
  const viewsAllAttendance = can(user, "attendance:view-all");
  const checksIn = can(user, "attendance:check-in");
  const hasPayslip = can(user, "salary:view-own");
  const hasPayrollWork = can(user, "payroll:view") || can(user, "salary:prepare");
  const hasAnything = viewsAdvances || viewsAllAttendance || checksIn || hasPayslip || hasPayrollWork;

  // Karyawan biasa memulai dari urusannya sendiri (absen); Finance & Admin HR
  // memulai dari pekerjaan yang menunggu mereka.
  const ownFirst = !viewsAllAdvances && !viewsAllAttendance;
  const subtitle = viewsAllAdvances
    ? "Pantau uang muka, pertanggungjawaban, dan penggajian."
    : viewsAllAttendance
      ? "Pantau absensi, foto wajah, dan cuti/izin karyawan."
      : "Pekerjaan dan urusan Anda hari ini.";

  const mine =
    checksIn || hasPayslip ? (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {checksIn && (
          <Block>
            <MyAttendanceCard user={user} />
          </Block>
        )}
        {checksIn && (
          <Block>
            <MyLeaveCard user={user} />
          </Block>
        )}
        {hasPayslip && (
          <Block>
            <MyPayslipCard user={user} />
          </Block>
        )}
      </div>
    ) : null;

  const staff =
    viewsAllAttendance || hasPayrollWork ? (
      <div className="grid gap-4 md:grid-cols-2">
        {viewsAllAttendance && (
          <Block>
            <AttendanceOverviewCard user={user} />
          </Block>
        )}
        {hasPayrollWork && (
          <Block>
            <PayrollWorkCard user={user} />
          </Block>
        )}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <Suspense fallback={<Skeleton className="h-28 w-full rounded-2xl" />}>
        <DashboardHero user={user} subtitle={subtitle} />
      </Suspense>
      {ownFirst && mine}
      {viewsAdvances && (
        <Block>
          <ActionNeeded user={user} />
        </Block>
      )}
      {staff}
      {!ownFirst && mine}
      {viewsAdvances && (
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
          <AdvanceSection user={user} />
        </Suspense>
      )}
      {!hasAnything && <GettingStarted user={user} />}
    </div>
  );
}

function Block({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton className="h-44 w-full rounded-2xl" />}>{children}</Suspense>;
}

// Ringkasan + uang muka terbaru. Finance melihat seluruh perusahaan, karyawan
// hanya miliknya sendiri.
async function AdvanceSection({ user }: { user: CompanyUser }) {
  const viewAll = can(user, "advance:view-all");
  const recipientId = viewAll ? undefined : user.id;
  const [summary, recent] = await Promise.all([
    getAdvanceSummary({ companyId: user.company.id, recipientId }),
    listAdvances({ companyId: user.company.id, recipientId, limit: RECENT_LIMIT }),
  ]);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{viewAll ? "Uang muka perusahaan" : "Uang muka"}</h2>
      <AdvanceSummaryCards summary={summary} />
      <RecentSection viewAll={viewAll} advances={recent} />
    </div>
  );
}

function RecentSection({
  viewAll,
  advances,
}: {
  viewAll: boolean;
  advances: Awaited<ReturnType<typeof listAdvances>>;
}) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="recent-advances-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="recent-advances-title" className="text-sm font-medium">
          Uang muka terbaru
        </h2>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/projects" />}>
          Buka proyek
          <ArrowRightIcon />
        </Button>
      </div>
      <RecentAdvancesTable advances={advances} showRecipient={viewAll} />
    </section>
  );
}

// Role tanpa ringkasan (misalnya Admin HR di perusahaan tanpa add-on Absensi).
function GettingStarted({ user }: { user: CompanyUser }) {
  return (
    <SectionCard title="Mulai dari sini" icon={CompassIcon}>
      {can(user, "user:manage-employee") && (
        <LinkRow href="/users" icon={UsersIcon} title="Pengguna" description="Kelola akun karyawan" />
      )}
      <LinkRow href="/" icon={CompassIcon} title="Semua menu" description="Buka menu yang tersedia untuk Anda" />
    </SectionCard>
  );
}

// Tampilan Owner: keuangan per proyek, lalu uang muka terbaru.
function OwnerView({ user }: { user: CompanyUser }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<OwnerDashboardSkeleton />}>
        <OwnerDashboard companyId={user.company.id} />
      </Suspense>
      {/* Absensi hari ini + cuti/foto wajah yang menunggu; hanya bila add-on Absensi aktif. */}
      {can(user, "attendance:view-all") && (
        <Block>
          <AttendanceOverviewCard user={user} />
        </Block>
      )}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <OwnerRecent user={user} />
      </Suspense>
    </div>
  );
}

async function OwnerRecent({ user }: { user: CompanyUser }) {
  const viewAll = can(user, "advance:view-all");
  const recent = await listAdvances({
    companyId: user.company.id,
    recipientId: viewAll ? undefined : user.id,
    limit: RECENT_LIMIT,
  });
  return <RecentSection viewAll={viewAll} advances={recent} />;
}

function OwnerDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}
