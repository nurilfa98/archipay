// Halaman /advances (Uang Muka).
//
// Alurnya dua tahap:
// 1. Tanpa ?project= (atau project tidak ada): kembali ke /projects. Uang muka
//    dibuka dari badge "Uang Muka" di kartu project.
// 2. Dengan ?project=<id> (atau ?project=none untuk uang muka lama): daftar
//    uang muka yang sudah disaring per project, dengan pita "Anda sedang di
//    project X" dan tombol ajukan/catat uang muka untuk project itu.
//
// Pola halaman yang terasa ringan dengan Cache Components:
// 1. Bagian STATIS (judul) di luar <Suspense>: ikut di-prefetch, sehingga
//    muncul instan saat menu diklik.
// 2. Bagian yang butuh user (cek permission, data) di dalam <Suspense>:
//    di-stream dari server, dan selama menunggu tampil skeleton.
//
// Cek permission WAJIB ada di setiap halaman, karena menyembunyikan menu di
// kotak menu tidak mencegah orang mengetik URL ini langsung.
//
// Isi daftar:
// - "Perlu tindakan Anda": konfirmasi terima, persetujuan, pencatatan cair.
// - Riwayat: OWNER/FINANCE melihat semua, karyawan hanya miliknya sendiri.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/streaming.md (bagian "Push dynamic access down")
// - node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md (Step 2)

import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvanceTodoList } from "@/features/advances/components/advance-todo-list";
import { AdvancesTable, type AdvanceRow } from "@/features/advances/components/advances-table";
import {
  RequestBlockedButton,
  RequestBlockedNotice,
  RequestBlockedProvider,
} from "@/features/advances/components/request-blocked-notice";
import { isAwaitingReceipts } from "@/features/advances/constants";
import {
  countOverdueAdvances,
  listAdvanceYears,
  listAdvances,
  type AdvanceListItem,
} from "@/features/advances/queries";
import { parseAdvanceFilters } from "@/features/advances/schemas";
import { needsActionFrom } from "@/features/advances/service";
import { NO_PROJECT } from "@/features/projects/constants";
import { ProjectBanner } from "@/features/projects/components/project-banner";
import { resolveProjectScope } from "@/features/projects/queries";
import { readProjectParam } from "@/features/projects/schemas";
import { getCompanySettings } from "@/features/settings/queries";
import { requirePermission, verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, formatShortDate } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Uang Muka",
};

// Data table memproses pencarian, urutan, dan halaman di browser, jadi
// riwayat dibatasi agar data yang dikirim tetap ringan. Bila sudah ribuan
// baris, pindahkan pencarian & halaman ke server.
const HISTORY_LIMIT = 500;

export default function AdvancesPage({ searchParams }: PageProps<"/advances">) {
  return (
    <RequestBlockedProvider>
      <PageHeader
        title="Uang Muka"
        description="Uang muka dikelompokkan per project."
        action={
          <Suspense>
            <AdvanceHeaderActions searchParams={searchParams} />
          </Suspense>
        }
      />
      <RequestBlockedNotice />
      <Suspense fallback={<AdvancesSkeleton />}>
        <AdvancesContent searchParams={searchParams} />
      </Suspense>
    </RequestBlockedProvider>
  );
}

// Tombol bergantung pada role dan project yang dipilih, jadi ikut di dalam
// <Suspense>. Hanya tampil di dalam project yang masih aktif.
// - OWNER          : Catat pencairan (push)
// - FINANCE        : Ajukan untuk saya (pull) + Usulkan pencairan (push)
// - Karyawan       : Ajukan uang muka (pull)
async function AdvanceHeaderActions({ searchParams }: Pick<PageProps<"/advances">, "searchParams">) {
  const user = await verifySession();
  const companyId = user.company.id;
  const scope = await resolveProjectScope(companyId, readProjectParam(await searchParams));
  if (scope.kind !== "project" || scope.project.status !== "ACTIVE") return null;
  const projectId = scope.project.id;

  const direct = can(user, "advance:disburse");
  const push = direct || can(user, "advance:propose");
  const request = can(user, "advance:request");
  const requestVariant = push ? "outline" : "brand";
  const requestLabel = push ? "Ajukan untuk saya" : "Ajukan uang muka";

  // Karyawan yang sudah mencapai batas uang muka tertunda tidak dibawa ke form;
  // tombolnya hanya menampilkan kartu info di halaman ini.
  let blocked: { overdue: number; limit: number } | null = null;
  if (request) {
    const [overdueCounts, { maxOverdueAdvances }] = await Promise.all([
      countOverdueAdvances(companyId, [user.id]),
      getCompanySettings(companyId),
    ]);
    const overdue = overdueCounts[user.id] ?? 0;
    if (overdue >= maxOverdueAdvances) blocked = { overdue, limit: maxOverdueAdvances };
  }

  return (
    <div className="flex flex-wrap gap-2">
      {request &&
        (blocked ? (
          <RequestBlockedButton variant={requestVariant} label={requestLabel} {...blocked} />
        ) : (
          <Button
            variant={requestVariant}
            nativeButton={false}
            render={<Link href={`/advances/request?project=${projectId}`} />}
          >
            <PlusIcon />
            {requestLabel}
          </Button>
        ))}
      {push && (
        <Button nativeButton={false} render={<Link href={`/advances/new?project=${projectId}`} />}>
          <PlusIcon />
          {direct ? "Catat pencairan" : "Usulkan pencairan"}
        </Button>
      )}
    </div>
  );
}

// searchParams (Promise) baru di-await di sini, di dalam <Suspense>, agar
// kerangka halaman tetap statis. Filter riwayat: ?project=&year=&month=&status=
async function AdvancesContent({ searchParams }: Pick<PageProps<"/advances">, "searchParams">) {
  const user = await requirePermission("advance:view-own");
  const companyId = user.company.id;
  const params = await searchParams;
  const scope = await resolveProjectScope(companyId, readProjectParam(params));

  // Uang muka selalu dibuka dari kartu project; tanpa project yang valid
  // kembali ke halaman Project.
  if (scope.kind === "picker") redirect("/projects");

  const projectFilter = scope.kind === "project" ? scope.project.id : NO_PROJECT;
  const viewAll = can(user, "advance:view-all");
  const recipientId = viewAll ? undefined : user.id;
  const filters = parseAdvanceFilters(params);

  const [open, history, years] = await Promise.all([
    // "Perlu tindakan" tidak ikut filter periode: tugas yang tertunda selalu tampil.
    listAdvances({
      companyId,
      recipientId,
      project: projectFilter,
      statuses: ["PENDING_APPROVAL", "APPROVED", "DISBURSED"],
    }),
    listAdvances({
      companyId,
      recipientId,
      project: projectFilter,
      year: filters.year,
      month: filters.month,
      statuses: filters.status ? [filters.status] : undefined,
      limit: HISTORY_LIMIT,
    }),
    listAdvanceYears({ companyId, recipientId, project: projectFilter }),
  ]);
  // Tahun dari URL tetap muncul di pilihan walau belum ada datanya.
  const yearOptions =
    filters.year && !years.includes(filters.year) ? [filters.year, ...years].sort((a, b) => b - a) : years;
  const todo = open.filter((advance) => needsActionFrom(advance, user));

  return (
    <div className="flex flex-col gap-6">
      <ProjectBanner project={scope.kind === "project" ? scope.project : null} />
      <AdvanceTodoList advances={todo} viewer={user} />
      <section className="flex flex-col gap-2" aria-labelledby="advance-history-title">
        <h2 id="advance-history-title" className="text-sm font-medium">
          {viewAll ? "Semua uang muka" : "Uang muka saya"}
        </h2>
        <AdvancesTable
          rows={history.map(toRow)}
          showRecipient={viewAll}
          filters={filters}
          years={yearOptions}
        />
      </section>
    </div>
  );
}

// Data untuk data table (Client Component): tanggal diformat di server
// dengan zona waktu perusahaan, Date diubah menjadi angka.
function toRow(advance: AdvanceListItem): AdvanceRow {
  return {
    id: advance.id,
    numberLabel: advance.number,
    purpose: advance.purpose,
    recipientName: advance.recipientName,
    createdAtLabel: formatDateTime(advance.createdAt),
    createdAtTime: advance.createdAt.getTime(),
    // Batas unggah nota baru ada setelah dana dicairkan.
    settlementDueLabel: advance.settlementDueAt ? formatShortDate(advance.settlementDueAt) : null,
    settlementDueTime: advance.settlementDueAt?.getTime() ?? null,
    // Sama dengan halaman detail: terlewati hanya berarti selama nota belum dikirim.
    settlementOverdue: advance.settlementDueAtPassed && isAwaitingReceipts(advance.status),
    amount: advance.amount,
    status: advance.status,
    disputed: !!advance.disputedAt,
  };
}

function AdvancesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
