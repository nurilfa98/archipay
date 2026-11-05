// Halaman /attendance/review?period=2026-11: review bulanan absensi
// (BUSINESS-FLOW §18.9). Owner mengunci periode & membebaskan denda (lewat
// detail per karyawan); Admin HR & Superadmin melihat. Rekap per karyawan:
// hadir, terlambat, pulang cepat, di luar radius, tidak absen pulang, tidak
// hadir, cuti/izin, dan denda. Ekspor PDF (cetak) & Excel.

import { FileDownIcon, FileSpreadsheetIcon, LockIcon } from "lucide-react";
import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LockControls } from "@/features/attendance/components/review-controls";
import { getMonthReview, PERIOD_PATTERN, periodLabel, previousPeriod } from "@/features/attendance/review-data";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, zonedDateString } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

export const metadata: Metadata = {
  title: "Review Bulanan Absensi",
};

export default function ReviewPage({ searchParams }: PageProps<"/attendance/review">) {
  return (
    <>
      <PageHeader
        title="Review bulanan"
        description="Periksa absensi, sanggahan, dan denda tiap karyawan, lalu kunci periode agar denda masuk Potong Gaji."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ReviewContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReviewContent({ searchParams }: Pick<PageProps<"/attendance/review">, "searchParams">) {
  const user = await requirePermission("attendance:view-all");
  // Cache Components: new Date() wajib setelah io(), agar tidak ikut prerender
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md).
  await io();
  const today = zonedDateString(new Date());
  const requested = (await searchParams).period;
  // Bawaan: bulan lalu (yang biasanya sedang direview & dikunci).
  const period =
    typeof requested === "string" && PERIOD_PATTERN.test(requested) ? requested : previousPeriod(today.slice(0, 7));
  const review = await getMonthReview(user.company.id, period, today);
  const canReview = can(user, "attendance:review");
  const label = periodLabel(period);
  const totalPenalty = review.summaries.reduce((total, row) => total + row.penaltyTotal, 0);

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <form method="get" className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Periode
            <Input type="month" name="period" defaultValue={period} className="w-44" />
          </label>
          <Button type="submit" variant="outline">
            Tampilkan
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`/api/attendance/review/export?period=${period}&format=pdf`} />}
          >
            <FileDownIcon />
            PDF
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`/api/attendance/review/export?period=${period}&format=xlsx`} />}
          >
            <FileSpreadsheetIcon />
            Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 font-medium">
            {label}
            {review.lock ? (
              <ToneBadge tone="success">
                <LockIcon className="size-3" /> Dikunci
              </ToneBadge>
            ) : (
              <ToneBadge tone="pending">Belum dikunci</ToneBadge>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {review.lock
              ? `Dikunci ${review.lock.lockedByName ?? ""} ${formatDateTime(review.lock.lockedAt)}. Denda yang berlaku sudah masuk menu Potong Gaji.`
              : `Denda berlaku ${formatRupiah(totalPenalty)}. Setelah dikunci, denda masuk menu Potong Gaji.`}
          </p>
          {!review.lock && review.pendingLeaves > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {review.pendingLeaves} pengajuan cuti/izin di bulan ini masih menunggu.{" "}
              <Link href="/attendance/leave" className="underline">
                Proses dulu
              </Link>{" "}
              sebelum mengunci.
            </p>
          )}
        </div>
        {canReview && <LockControls period={period} periodLabel={label} locked={!!review.lock} />}
      </div>

      {review.summaries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Belum ada karyawan yang wajib absen.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Karyawan</th>
                <th className="p-3 text-right font-medium">Hadir</th>
                <th className="p-3 text-right font-medium">Terlambat</th>
                <th className="p-3 text-right font-medium">Pulang cepat</th>
                <th className="p-3 text-right font-medium">Luar radius</th>
                <th className="p-3 text-right font-medium">Tdk absen pulang</th>
                <th className="p-3 text-right font-medium">Tidak hadir</th>
                <th className="p-3 text-right font-medium">Cuti/izin</th>
                <th className="p-3 text-right font-medium">Denda</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {review.summaries.map((row) => (
                <tr key={row.userId} className="hover:bg-muted/40">
                  <td className="p-3">
                    <Link
                      href={`/attendance/review/${row.userId}?period=${period}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {row.fullName}
                    </Link>
                  </td>
                  <td className="p-3 text-right tabular-nums">{row.present}</td>
                  <td className="p-3 text-right tabular-nums">
                    {row.lateCount > 0 ? `${row.lateCount}× (${row.lateMinutes} mnt)` : "-"}
                  </td>
                  <td className="p-3 text-right tabular-nums">{row.earlyCount || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{row.outsideCount || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{row.noCheckout || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{row.absent || "-"}</td>
                  <td className="p-3 text-right tabular-nums">
                    {row.paidLeaveDays + row.unpaidLeaveDays > 0
                      ? `${row.paidLeaveDays}${row.unpaidLeaveDays ? ` + ${row.unpaidLeaveDays} tdk dibayar` : ""}`
                      : "-"}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {row.penaltyTotal > 0 ? formatRupiah(row.penaltyTotal) : "-"}
                    {row.waivedCount > 0 && (
                      <span className="block text-xs text-muted-foreground">{row.waivedCount} dibebaskan</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Hari ini belum dihitung tidak hadir. Cuti/izin dihitung dalam hari kerja. Klik nama untuk detail, sanggahan,
        bebaskan denda, dan koreksi absen.
      </p>
    </>
  );
}
