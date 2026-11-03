// Halaman /attendance/review/[userId]?period=2026-11: detail review bulanan
// satu karyawan (BUSINESS-FLOW §18.9): denda (centang = berlaku, cabut =
// dibebaskan), hari tidak hadir & cuti, semua absen beserta selfie, alasan &
// sanggahan, dan koreksi absen. Mengubah hanya Owner & selama periode belum
// dikunci; Admin HR & Superadmin melihat.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordList } from "@/features/attendance/components/record-list";
import { CorrectionForm, PenaltyWaiveSwitch } from "@/features/attendance/components/review-controls";
import { listLocations } from "@/features/attendance/queries";
import { dayStatus } from "@/features/attendance/review";
import { getMonthReview, PERIOD_PATTERN, periodLabel, previousPeriod } from "@/features/attendance/review-data";
import { idSchema } from "@/features/attendance/schemas";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateOnly, zonedDateString } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

export const metadata: Metadata = {
  title: "Review Absensi Karyawan",
};

export default function ReviewPersonPage({ params, searchParams }: PageProps<"/attendance/review/[userId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReviewPersonContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ReviewPersonContent({ params, searchParams }: PageProps<"/attendance/review/[userId]">) {
  const user = await requirePermission("attendance:view-all");
  const userId = idSchema.safeParse((await params).userId);
  if (!userId.success) notFound();
  const now = new Date();
  const today = zonedDateString(now);
  const requested = (await searchParams).period;
  const period =
    typeof requested === "string" && PERIOD_PATTERN.test(requested) ? requested : previousPeriod(today.slice(0, 7));

  const [review, locations] = await Promise.all([
    getMonthReview(user.company.id, period, today),
    listLocations(user.company.id),
  ]);
  const person = review.people.find((item) => item.id === userId.data);
  if (!person) notFound();
  const summary = review.summaries.find((item) => item.userId === person.id)!;
  const records = review.records.filter((record) => record.userId === person.id).reverse();
  const penalties = review.penalties.filter((penalty) => penalty.userId === person.id);
  const leaves = review.leaves.filter((leave) => leave.userId === person.id);
  const recordByDate = new Map(records.map((record) => [record.workDate, record]));
  const absentDates = review.dates.filter(
    (date) =>
      dayStatus({
        date,
        today,
        startDate: person.startDate,
        workDays: review.settings.workDays,
        holidays: review.holidays,
        record: recordByDate.get(date),
        leave: leaves.find((leave) => leave.startDate <= date && leave.endDate >= date),
      }) === "ABSENT",
  );
  const canEdit = can(user, "attendance:review") && !review.lock;
  const label = periodLabel(period);

  return (
    <>
      <PageHeader
        title={person.fullName}
        description={`Review ${label}${review.lock ? " · periode sudah dikunci" : ""}`}
      />
      <Link href={`/attendance/review?period=${period}`} className="text-sm text-brand hover:underline">
        ← Kembali ke rekap {label}
      </Link>

      <div className="flex flex-wrap gap-2">
        <ToneBadge tone="success">Hadir {summary.present}</ToneBadge>
        {summary.lateCount > 0 && (
          <ToneBadge tone="warning">
            Terlambat {summary.lateCount}× ({summary.lateMinutes} mnt)
          </ToneBadge>
        )}
        {summary.earlyCount > 0 && <ToneBadge tone="warning">Pulang cepat {summary.earlyCount}</ToneBadge>}
        {summary.outsideCount > 0 && <ToneBadge tone="danger">Luar radius {summary.outsideCount}</ToneBadge>}
        {summary.noCheckout > 0 && <ToneBadge tone="danger">Tidak absen pulang {summary.noCheckout}</ToneBadge>}
        {summary.absent > 0 && <ToneBadge tone="danger">Tidak hadir {summary.absent}</ToneBadge>}
        {Object.entries(summary.leaveByType).map(([type, days]) => (
          <ToneBadge key={type} tone="active">
            {type} {days} hari
          </ToneBadge>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Denda keterlambatan</CardTitle>
          <CardDescription>
            Total berlaku {formatRupiah(summary.penaltyTotal)}. Cabut centang untuk membebaskan denda (misal sanggahan
            diterima).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {penalties.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada denda bulan ini.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {penalties.map((penalty) => (
                <li key={penalty.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {formatDateOnly(penalty.workDate)} · terlambat {penalty.lateMinutes} mnt ·{" "}
                      {formatRupiah(penalty.amount)}
                    </p>
                    {penalty.waiveNote && <p className="text-muted-foreground">{penalty.waiveNote}</p>}
                    {penalty.deductedAt && (
                      <p className="text-muted-foreground">Sudah dipotong (periode gaji {penalty.payrollPeriod})</p>
                    )}
                  </div>
                  <PenaltyWaiveSwitch
                    penaltyId={penalty.id}
                    active={penalty.status === "ACTIVE"}
                    label={`Denda ${formatDateOnly(penalty.workDate)}`}
                    disabled={!canEdit || !!penalty.deductedAt}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(absentDates.length > 0 || leaves.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Tidak hadir & cuti</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {absentDates.length > 0 && (
              <p>
                <span className="font-medium">Tidak hadir tanpa keterangan:</span>{" "}
                {absentDates.map((date) => formatDateOnly(date)).join(", ")}
              </p>
            )}
            {leaves.map((leave) => (
              <p key={`${leave.startDate}-${leave.typeName}`}>
                <span className="font-medium">{leave.typeName}</span>
                {leave.isPaid ? "" : " (tidak dibayar)"}: {formatDateOnly(leave.startDate)}
                {leave.endDate !== leave.startDate ? ` – ${formatDateOnly(leave.endDate)}` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Koreksi absen</CardTitle>
            <CardDescription>
              Tambah absen yang terlewat (misal HP mati) atau ganti jam masuk/pulang. Keterlambatan & denda dihitung
              ulang.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CorrectionForm
              userId={person.id}
              locations={locations.filter((location) => location.isActive)}
              minDate={review.dates[0]}
              maxDate={review.dates[review.dates.length - 1] < today ? review.dates[review.dates.length - 1] : today}
            />
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="records">
        <h2 id="records" className="font-medium">
          Absen {label}
        </h2>
        <RecordList records={records} now={now} emptyText="Tidak ada absen di bulan ini." />
      </section>
    </>
  );
}
