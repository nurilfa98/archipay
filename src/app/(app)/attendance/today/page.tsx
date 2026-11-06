// Halaman /attendance/today: absensi semua orang pada hari ini (Owner, Admin
// HR; Superadmin baca saja). Tanggal menurut zona waktu perusahaan; absen di
// lokasi WITA/WIT tetap tercatat dengan tanggal kerja zona lokasinya.
//
// Susunan: ringkasan angka, yang sudah absen, yang cuti/izin, lalu yang belum
// absen. Avatar memakai foto acuan wajah yang disetujui (bila ada).

import { ClockAlertIcon, PlaneIcon, UserCheckIcon, UserXIcon, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonAvatar } from "@/features/attendance/components/person-avatar";
import { RecordList } from "@/features/attendance/components/record-list";
import { listFullDayLeavesOn } from "@/features/attendance/leave-queries";
import { listApprovedFaceIds, listCheckInPeople, listRecordsOnDate } from "@/features/attendance/queries";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateOnly, zonedDateString } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Absensi Hari Ini",
};

export default function TodayPage() {
  return (
    <>
      <PageHeader
        title="Absensi hari ini"
        description="Siapa sudah masuk, terlambat, di luar radius, atau belum absen."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TodayContent />
      </Suspense>
    </>
  );
}

async function TodayContent() {
  const user = await requirePermission("attendance:view-all");
  // Cache Components: new Date() wajib setelah io(), agar tidak ikut prerender
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md).
  await io();
  const now = new Date();
  const today = zonedDateString(now);
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

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {formatDateOnly(today)} · {records.length} dari {people.length} orang sudah absen masuk.
      </p>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={UserCheckIcon} label="Sudah absen" value={records.length} tone="emerald" />
        <StatTile icon={ClockAlertIcon} label="Terlambat" value={late} tone="amber" />
        <StatTile icon={PlaneIcon} label="Cuti / izin" value={onLeave.length} tone="indigo" />
        <StatTile icon={UserXIcon} label="Belum absen" value={absent.length} tone="rose" />
      </dl>

      <section className="flex flex-col gap-3" aria-labelledby="checked-in">
        <SectionHeading id="checked-in" count={records.length}>
          Sudah absen
        </SectionHeading>
        <RecordList
          records={records}
          names={names}
          photos={photos}
          now={now}
          emptyText="Belum ada yang absen hari ini."
        />
      </section>

      {onLeave.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="on-leave">
          <SectionHeading id="on-leave" count={onLeave.length}>
            Cuti / izin
          </SectionHeading>
          <ul className="divide-y rounded-xl border bg-card">
            {onLeave.map((person) => {
              const leave = leaveByUser.get(person.id)!;
              return (
                <PersonRow
                  key={person.id}
                  name={person.fullName}
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
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="not-yet">
        <SectionHeading id="not-yet" count={absent.length}>
          Belum absen masuk
        </SectionHeading>
        {absent.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            Semua sudah absen masuk.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {absent.map((person) => (
              <PersonRow
                key={person.id}
                name={person.fullName}
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
        )}
      </section>
    </>
  );
}

const TILE_TONES = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
} as const;

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: keyof typeof TILE_TONES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 sm:p-4">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TILE_TONES[tone])}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <dd className="text-2xl leading-none font-semibold tabular-nums">{value}</dd>
        <dt className="mt-1 truncate text-xs text-muted-foreground">{label}</dt>
      </div>
    </div>
  );
}

function SectionHeading({ id, count, children }: { id: string; count: number; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2 font-medium">
      {children}
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
        {count}
      </span>
    </h2>
  );
}

function PersonRow({
  name,
  photoId,
  subtitle,
  badge,
}: {
  name: string;
  photoId: string | null;
  subtitle: ReactNode;
  badge: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 p-3 sm:p-4">
      <PersonAvatar name={name} photoId={photoId} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="shrink-0">{badge}</div>
    </li>
  );
}
