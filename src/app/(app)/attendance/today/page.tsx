// Halaman /attendance/today: absensi semua orang pada hari ini (Owner, Admin
// HR; Superadmin baca saja). Tanggal menurut zona waktu perusahaan; absen di
// lokasi WITA/WIT tetap tercatat dengan tanggal kerja zona lokasinya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordList } from "@/features/attendance/components/record-list";
import { listFullDayLeavesOn } from "@/features/attendance/leave-queries";
import { listCheckInPeople, listRecordsOnDate } from "@/features/attendance/queries";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateOnly, zonedDateString } from "@/lib/dates";

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
  const now = new Date();
  const today = zonedDateString(now);
  const [people, records, leaves] = await Promise.all([
    listCheckInPeople(user.company.id),
    listRecordsOnDate(user.company.id, today),
    listFullDayLeavesOn(user.company.id, today),
  ]);
  const leaveByUser = new Map(leaves.map((leave) => [leave.userId, leave]));
  const names = new Map(people.map((person) => [person.id, person.fullName]));
  const checkedIn = new Set(records.map((record) => record.userId));
  const onLeave = people.filter((person) => !checkedIn.has(person.id) && leaveByUser.has(person.id));
  const absent = people.filter((person) => !checkedIn.has(person.id) && !leaveByUser.has(person.id));

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {formatDateOnly(today)} · {records.length} dari {people.length} orang sudah absen masuk.
      </p>
      <RecordList records={records} names={names} now={now} emptyText="Belum ada yang absen hari ini." />
      {onLeave.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="on-leave">
          <h2 id="on-leave" className="font-medium">
            Cuti / izin ({onLeave.length})
          </h2>
          <ul className="divide-y rounded-lg border">
            {onLeave.map((person) => (
              <li key={person.id} className="flex justify-between gap-2 p-3 text-sm">
                <span>{person.fullName}</span>
                <span className="text-muted-foreground">
                  {leaveByUser.get(person.id)!.typeName} · {leaveByUser.get(person.id)!.number}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2" aria-labelledby="not-yet">
        <h2 id="not-yet" className="font-medium">
          Belum absen masuk ({absent.length})
        </h2>
        {absent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Semua sudah absen masuk.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {absent.map((person) => (
              <li key={person.id} className="p-3 text-sm">
                {person.fullName}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
