// Halaman /attendance/today: absensi semua orang pada hari ini (Owner, Admin
// HR; Superadmin baca saja). Tanggal menurut zona waktu perusahaan; absen di
// lokasi WITA/WIT tetap tercatat dengan tanggal kerja zona lokasinya.
//
// Satu daftar per kapsul, seperti filter status di Log Error:
//   /attendance/today              Sudah absen (bawaan)
//   /attendance/today?tab=belum    Belum absen masuk
//   /attendance/today?tab=cuti     Cuti / izin
// Hanya daftar kapsul yang dipilih yang ditampilkan; angka di kapsul tetap lengkap.
// Avatar memakai foto acuan wajah yang disetujui (bila ada).

import { MapPinIcon, PlaneIcon, UserXIcon } from "lucide-react";
import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLocalClock } from "@/features/attendance/clock";
import { PersonAvatar } from "@/features/attendance/components/person-avatar";
import { timezoneLabel } from "@/features/attendance/constants";
import { listFullDayLeavesOn } from "@/features/attendance/leave-queries";
import {
  listApprovedFaceIds,
  listCheckInPeople,
  listRecordsOnDate,
  type AttendanceRecordRow,
} from "@/features/attendance/queries";
import { dayTags } from "@/features/attendance/status";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateOnly, zonedDateString } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Absensi Hari Ini",
};

type TabKey = "sudah" | "belum" | "cuti";

export default function TodayPage({ searchParams }: PageProps<"/attendance/today">) {
  return (
    <>
      <PageHeader 
        title="Absensi hari ini"
        description="Siapa sudah masuk, terlambat, di luar radius, atau belum absen."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        {searchParams.then((params) => (
          <TodayContent params={params} />
        ))}
      </Suspense>
    </>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function TodayContent({ params }: { params: Record<string, string | string[] | undefined> }) {
  const user = await requirePermission("attendance:view-all");
  const tabParam = first(params.tab);
  const tab: TabKey = tabParam === "belum" || tabParam === "cuti" ? tabParam : "sudah";

  // Cache Components: new Date() wajib setelah io(), agar tidak ikut prerender
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md).
  await io();
  const now = new Date();
  const today = zonedDateString(now);
  // Nama membuka detail Review absensi orang itu untuk bulan berjalan.
  const reviewHref = (userId: string) => `/attendance/review/${userId}?period=${today.slice(0, 7)}`;
  const [people, records, leaves, photos] = await Promise.all([
    listCheckInPeople(user.company.id),
    listRecordsOnDate(user.company.id, today),
    listFullDayLeavesOn(user.company.id, today),
    listApprovedFaceIds(user.company.id),
  ]);
  const leaveByUser = new Map(leaves.map((leave) => [leave.userId, leave]));
  const names = new Map(people.map((person) => [person.id, person.fullName]));
  const checkedIn = new Set(records.map((record) => record.userId));
  const onLeave = people.filter((person) => !checkedIn.has(person.id) && leaveByUser.has(person.id));
  const absent = people.filter((person) => !checkedIn.has(person.id) && !leaveByUser.has(person.id));
  const late = records.filter((record) => record.lateMinutes > 0).length;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "sudah", label: "Sudah absen", count: records.length },
    { key: "belum", label: "Belum absen", count: absent.length },
    { key: "cuti", label: "Cuti / izin", count: onLeave.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring status absen hari ini">
        {tabs.map((item) => (
          <Link
            key={item.key}
            href={item.key === "sudah" ? "/attendance/today" : `/attendance/today?tab=${item.key}`}
            aria-current={item.key === tab ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              item.key === tab ? "border-brand bg-brand/10 text-brand" : "bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
            <span className="tabular-nums opacity-70">{item.count}</span>
          </Link>
        ))}
      </div>

      {tab === "sudah" &&
        (records.length === 0 ? (
          <Empty>Belum ada yang absen hari ini.</Empty>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {records.map((record) => (
              <RecordRow
                key={record.id}
                record={record}
                name={names.get(record.userId) ?? "-"}
                href={reviewHref(record.userId)}
                photoId={photos.get(record.userId) ?? null}
                now={now}
              />
            ))}
          </ul>
        ))}

      {tab === "belum" &&
        (absent.length === 0 ? (
          <Empty>Semua sudah absen masuk.</Empty>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {absent.map((person) => (
              <PersonRow
                key={person.id}
                name={person.fullName}
                href={reviewHref(person.id)}
                photoId={photos.get(person.id) ?? null}
                subtitle={person.email}
                badge={
                  <ToneBadge tone="warning">
                    <UserXIcon />
                    Belum absen
                  </ToneBadge>
                }
              />
            ))}
          </ul>
        ))}

      {tab === "cuti" &&
        (onLeave.length === 0 ? (
          <Empty>Tidak ada yang cuti / izin hari ini.</Empty>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {onLeave.map((person) => {
              const leave = leaveByUser.get(person.id)!;
              return (
                <PersonRow
                  key={person.id}
                  name={person.fullName}
                  href={reviewHref(person.id)}
                  photoId={photos.get(person.id) ?? null}
                  subtitle={
                    <>
                      {leave.number}
                      {leave.endDate > today && ` · sampai ${formatDateOnly(leave.endDate)}`}
                    </>
                  }
                  badge={
                    <ToneBadge tone="active">
                      <PlaneIcon />
                      {leave.typeName}
                    </ToneBadge>
                  }
                />
              );
            })}
          </ul>
        ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}

// Foto dan nama adalah link ke detail Review absensi orang itu (nama tetap teks hitam).
function PersonLink({
  href,
  name,
  className,
  children,
}: {
  href: string;
  name: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} aria-label={`Lihat review absensi ${name}`} className={className}>
      {children}
    </Link>
  );
}

// Satu orang yang sudah absen: nama + tanda status, jam masuk & lokasi, jam pulang, dan alasan
// (terlambat, pulang cepat, di luar radius) bila ada.
function RecordRow({
  record,
  name,
  href,
  photoId,
  now,
}: {
  record: AttendanceRecordRow;
  name: string;
  href: string;
  photoId: string | null;
  now: Date;
}) {
  const zone = timezoneLabel(record.timezone);
  const notes = [
    record.lateReason && `Terlambat: ${record.lateReason}`,
    record.earlyReason && `Pulang cepat: ${record.earlyReason}`,
    record.checkInOutsideReason && `Di luar radius (masuk): ${record.checkInOutsideReason}`,
    record.checkOutOutsideReason && `Di luar radius (pulang): ${record.checkOutOutsideReason}`,
    record.correctionNote && `Dikoreksi Owner: ${record.correctionNote}`,
  ].filter(Boolean);

  return (
    <li className="flex items-start gap-3 p-3 sm:p-4">
      <PersonLink href={href} name={name} className="shrink-0">
        <PersonAvatar name={name} photoId={photoId} />
      </PersonLink>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PersonLink href={href} name={name} className="truncate font-medium hover:underline">
            {name}
          </PersonLink>
          {dayTags(record, now).map((tag) => (
            <ToneBadge key={tag.label} tone={tag.tone}>
              {tag.label}
            </ToneBadge>
          ))}
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Masuk</dt>
            <dd className="font-medium tabular-nums">
              {formatLocalClock(record.checkInAt, record.timezone)} {zone}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Pulang</dt>
            <dd className="font-medium tabular-nums">
              {record.checkOutAt ? `${formatLocalClock(record.checkOutAt, record.timezone)} ${zone}` : "-"}
            </dd>
          </div>
        </dl>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5 shrink-0" />
          <span className="truncate">
            {record.checkInLocationName} · {record.checkInDistance} m
          </span>
        </p>
        {notes.map((note) => (
          <p key={String(note)} className="text-xs text-muted-foreground">
            {note}
          </p>
        ))}
      </div>
    </li>
  );
}

function PersonRow({
  name,
  href,
  photoId,
  subtitle,
  badge,
}: {
  name: string;
  href: string;
  photoId: string | null;
  subtitle: ReactNode;
  badge: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 p-3 sm:p-4">
      <PersonLink href={href} name={name} className="shrink-0">
        <PersonAvatar name={name} photoId={photoId} />
      </PersonLink>
      <div className="min-w-0 flex-1">
        <PersonLink href={href} name={name} className="block truncate font-medium hover:underline">
          {name}
        </PersonLink>
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="shrink-0">{badge}</div>
    </li>
  );
}
