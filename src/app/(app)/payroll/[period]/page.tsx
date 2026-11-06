// Halaman /payroll/[period] (Owner & Finance / salary:prepare, BUSINESS-FLOW
// §20.1, §20.4–20.5): draf atau hasil penggajian satu bulan.
// - Draf: tanggal bayar, hitung ulang, ubah/hapus baris, tambah baris manual.
//   Finance tidak bisa mengubah slip dirinya sendiri, Owner, atau Finance lain
//   (features/salaries/access.ts), lalu menekan "Kirim ke Owner".
// - Selesaikan & Buka kunci: hanya Owner (salary:manage).
// - Selesai: unduh slip, rekap, Excel transfer.

import {
  CircleAlertIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  InfoIcon,
  LockIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isPeriodLocked } from "@/features/attendance/period-lock";
import { periodLabel } from "@/features/attendance/review-data";
import {
  AddManualLineButton,
  EditLineButton,
  FinalizeButton,
  PayDateForm,
  RecalculateButton,
  ReopenButton,
  RemoveLineButton,
  RequestReviewButton,
} from "@/features/salaries/components/run-controls";
import { salaryEditChecker } from "@/features/salaries/access";
import {
  EDITABLE_SOURCES,
  MAX_DEDUCTION_PERCENT,
  REMOVABLE_SOURCES,
  RUN_STATUS_LABELS,
  RUN_STATUS_TONES,
} from "@/features/salaries/constants";
import { exceedsDeductionLimit } from "@/features/salaries/payslip-math";
import { getPayrollSettings, getRun, type Payslip, type PayslipLine } from "@/features/salaries/queries";
import { listPendingAcks, listPendingReturnClaims } from "@/features/settlements/queries";
import { periodSchema } from "@/features/salaries/schemas";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { CopyButton } from "@/components/copy-button";
import { formatAccountNumber } from "@/lib/bank";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Penggajian bulanan",
};

export default function PayrollRunPage({ params }: PageProps<"/payroll/[period]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PayrollRunContent params={params} />
    </Suspense>
  );
}

async function PayrollRunContent({ params }: Pick<PageProps<"/payroll/[period]">, "params">) {
  const user = await requirePermission("salary:prepare");
  const period = periodSchema.safeParse((await params).period);
  if (!period.success) notFound();
  const companyId = user.company.id;
  const [run, settings, attendanceLocked, canEditSlip] = await Promise.all([
    getRun(companyId, period.data),
    getPayrollSettings(companyId),
    isPeriodLocked(companyId, period.data),
    salaryEditChecker(user),
  ]);
  if (!run) notFound();
  // Owner mengesahkan; Finance menyiapkan lalu mengirim ke Owner.
  const isOwner = can(user, "salary:manage");

  const label = periodLabel(run.period);
  const draft = run.status === "DRAFT";
  const totals = run.payslips.reduce(
    (sum, slip) => ({
      earnings: sum.earnings + slip.totalEarnings,
      deductions: sum.deductions + slip.totalDeductions,
      net: sum.net + slip.netPay,
    }),
    { earnings: 0, deductions: 0, net: 0 },
  );
  const allLines = run.payslips.flatMap((slip) => slip.lines);
  const pendingAdvances = allLines.filter((line) => line.source === "ADVANCE" && !line.postedAt && line.amount > 0);
  const pendingPenalties = allLines.filter((line) => line.source === "PENALTY" && !line.postedAt);
  const needsAttendanceLock = settings.absenceDeduction && user.company.attendance && !attendanceLocked;
  const negative = run.payslips.filter((slip) => slip.netPay < 0);
  // Laporan pengembalian karyawan (lewat batas) yang belum diputuskan menahan
  // penyelesaian penggajian (BUSINESS-FLOW §8.1.1).
  const waitingClaims = draft
    ? await listPendingReturnClaims(companyId, {
        overdueOnly: true,
        userIds: run.payslips.map((slip) => slip.userId),
      })
    : [];
  // Penggantian yang sudah dibayar tetapi belum dijawab karyawan: hanya info,
  // TIDAK menahan penggajian (BUSINESS-FLOW §8.1.2).
  const unconfirmedAcks = draft
    ? await listPendingAcks(companyId, { userIds: run.payslips.map((slip) => slip.userId) })
    : [];
  const exportUrl = (format: string) => `/api/payroll/${run.period}/export?format=${format}`;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Penggajian {label}
            <ToneBadge tone={RUN_STATUS_TONES[run.status]}>{RUN_STATUS_LABELS[run.status]}</ToneBadge>
          </span>
        }
        description={
          draft
            ? `Dihitung ${formatDateTime(run.calculatedAt)}. ${isOwner ? "Periksa, sesuaikan, lalu selesaikan." : "Siapkan, lalu kirim ke Owner untuk diselesaikan."}`
            : `Diselesaikan ${run.finalizedAt ? formatDateTime(run.finalizedAt) : ""}${run.finalizedByName ? ` oleh ${run.finalizedByName}` : ""}${run.payDate ? ` · dibayar ${formatDateOnly(run.payDate)}` : ""}.`
        }
      />
      <Link href="/payroll" className="text-sm text-brand hover:underline">
        ← Kembali ke Penggajian
      </Link>

      {draft && run.reviewRequestedAt && (
        <Alert>
          <SendIcon />
          <AlertTitle>{isOwner ? "Siap diperiksa" : "Sudah dikirim ke Owner"}</AlertTitle>
          <AlertDescription>
            {run.reviewRequestedByName ?? "Finance"} mengirim penggajian ini ke Owner{" "}
            {formatDateTime(run.reviewRequestedAt)}.{" "}
            {isOwner ? "Periksa lalu tekan Selesaikan." : "Bila draf diubah lagi, kirim ulang setelahnya."}
          </AlertDescription>
        </Alert>
      )}
      {draft && needsAttendanceLock && (
        <Alert>
          <LockIcon />
          <AlertTitle>Periode absensi {label} belum dikunci</AlertTitle>
          <AlertDescription>
            Potong otomatis ketidakhadiran menyala, jadi hari tidak hadir harus final dulu. Kunci di{" "}
            <Link href={`/attendance/review?period=${run.period}`} className="underline">
              Absensi → Review bulanan
            </Link>
            , lalu tekan Hitung ulang.
          </AlertDescription>
        </Alert>
      )}
      {draft && waitingClaims.length > 0 && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Ada laporan pengembalian yang belum diputuskan</AlertTitle>
          <AlertDescription>
            {waitingClaims.map((claim, index) => (
              <span key={claim.id}>
                {index > 0 && ", "}
                <Link href={`/settlements/${claim.settlementId}`} className="underline">
                  {claim.recipientName}
                </Link>{" "}
                ({formatRupiah(claim.amount)})
              </span>
            ))}
            . Konfirmasi atau tolak dulu, lalu tekan Hitung ulang. Penggajian tidak bisa diselesaikan sebelum itu.
          </AlertDescription>
        </Alert>
      )}
      {draft && unconfirmedAcks.length > 0 && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Penggantian belum dikonfirmasi karyawan</AlertTitle>
          <AlertDescription>
            {unconfirmedAcks.map((ack, index) => (
              <span key={ack.entryId}>
                {index > 0 && ", "}
                <Link href={`/settlements/${ack.settlementId}`} className="underline">
                  {ack.recipientName}
                </Link>{" "}
                ({formatRupiah(ack.amount)})
              </span>
            ))}
            . Tidak menahan penggajian; otomatis dianggap diterima setelah 3 hari tanpa jawaban.
          </AlertDescription>
        </Alert>
      )}
      {draft && negative.length > 0 && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Gaji bersih minus</AlertTitle>
          <AlertDescription>
            {negative.map((slip) => slip.fullName).join(", ")}. Kurangi atau hapus potongannya sebelum menyelesaikan.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Karyawan" value={String(run.payslips.length)} />
            <Stat label="Total pendapatan" value={formatRupiah(totals.earnings)} />
            <Stat label="Total potongan" value={formatRupiah(totals.deductions)} />
            <Stat label="Total gaji bersih" value={formatRupiah(totals.net)} strong />
          </dl>
          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            {draft ? (
              <>
                <PayDateForm period={run.period} payDate={run.payDate} />
                <RecalculateButton period={run.period} />
                {isOwner ? (
                  <FinalizeButton
                    period={run.period}
                    periodLabel={label}
                    totalNet={totals.net}
                    people={run.payslips.length}
                    pendingAdvances={pendingAdvances.length}
                    pendingPenalties={pendingPenalties.length}
                    disabled={
                      !run.payDate ||
                      needsAttendanceLock ||
                      negative.length > 0 ||
                      waitingClaims.length > 0 ||
                      run.payslips.length === 0
                    }
                  />
                ) : (
                  <RequestReviewButton
                    period={run.period}
                    disabled={!run.payDate || run.payslips.length === 0 || !!run.reviewRequestedAt}
                  />
                )}
              </>
            ) : (
              <>
                <Button variant="brand" nativeButton={false} render={<a href={exportUrl("slips")} />}>
                  <DownloadIcon />
                  Semua slip (PDF)
                </Button>
                <Button variant="outline" nativeButton={false} render={<a href={exportUrl("recap")} />}>
                  <DownloadIcon />
                  Rekap (PDF)
                </Button>
                <Button variant="outline" nativeButton={false} render={<a href={exportUrl("xlsx")} />}>
                  <FileSpreadsheetIcon />
                  Excel transfer
                </Button>
                {isOwner && <ReopenButton period={run.period} />}
              </>
            )}
          </div>
          {draft && !run.payDate && (
            <p className="text-sm text-muted-foreground">
              {isOwner ? "Isi tanggal bayar sebelum menyelesaikan." : "Isi tanggal bayar sebelum mengirim ke Owner."}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {run.payslips.map((slip) => (
          <PayslipCard key={slip.id} slip={slip} draft={draft} editable={draft && canEditSlip(slip.userId)} />
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong ? "text-lg font-semibold" : "font-medium")}>{value}</dd>
    </div>
  );
}

// `editable` = draf DAN aktor boleh mengubah slip orang ini (Finance tidak
// bisa mengubah slip dirinya sendiri, Owner, atau Finance lain).
function PayslipCard({ slip, draft, editable }: { slip: Payslip; draft: boolean; editable: boolean }) {
  const earnings = slip.lines.filter((line) => line.type === "EARNING");
  const deductions = slip.lines.filter((line) => line.type === "DEDUCTION");
  const overLimit = exceedsDeductionLimit({ earnings: slip.totalEarnings, deductions: slip.totalDeductions });
  const days = [
    `${slip.workingDays} hari kerja`,
    slip.presentDays != null && `hadir ${slip.presentDays}`,
    slip.absentDays != null && `tidak hadir ${slip.absentDays}`,
    slip.unpaidLeaveDays ? `cuti/izin tidak dibayar ${slip.unpaidLeaveDays}` : null,
    slip.dailyRate != null && `tarif ${formatRupiah(slip.dailyRate)}/hari`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>{slip.fullName}</span>
          <span className="tabular-nums">{formatRupiah(slip.netPay)}</span>
        </CardTitle>
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
          {slip.bankName && slip.bankAccountNumber ? (
            <>
              {slip.bankName} {formatAccountNumber(slip.bankName, slip.bankAccountNumber)}
              <CopyButton
                value={slip.bankAccountNumber}
                label={`Salin nomor rekening ${slip.fullName}`}
                successMessage="Nomor rekening disalin."
              />
            </>
          ) : (
            "Rekening belum diisi"
          )}{" "}
          · {days}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <LineTable title="Pendapatan" lines={earnings} total={slip.totalEarnings} draft={editable} />
          <LineTable title="Potongan" lines={deductions} total={slip.totalDeductions} draft={editable} />
        </div>
        {overLimit && (
          <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300">
            <TriangleAlertIcon className="size-4" />
            Potongan melebihi {MAX_DEDUCTION_PERCENT}% pendapatan (batas potongan upah PP 36/2021).
          </p>
        )}
        <div>
          {draft ? (
            editable ? (
              <AddManualLineButton payslipId={slip.id} fullName={slip.fullName} />
            ) : (
              <p className="text-sm text-muted-foreground">Slip ini hanya bisa diubah Owner.</p>
            )
          ) : (
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/payslips/${slip.id}`} />}>
              <DownloadIcon />
              Slip {slip.fullName.split(" ")[0]} (PDF)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LineTable({
  title,
  lines,
  total,
  draft,
}: {
  title: string;
  lines: PayslipLine[];
  total: number;
  draft: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="font-medium">{title}</p>
      {lines.length === 0 ? (
        <p className="text-muted-foreground">-</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {lines.map((line) => {
            const editable = draft && !line.postedAt;
            return (
              <li key={line.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  {line.label}
                  {line.postedAt && <span className="ml-1 text-xs text-muted-foreground">(sudah tercatat)</span>}
                  {line.edited && <span className="ml-1 text-xs text-muted-foreground">(diubah)</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="tabular-nums">{formatRupiah(line.amount)}</span>
                  {editable && EDITABLE_SOURCES.includes(line.source) && (
                    <EditLineButton lineId={line.id} label={line.label} amount={line.amount} />
                  )}
                  {editable && REMOVABLE_SOURCES.includes(line.source) && (
                    <RemoveLineButton lineId={line.id} label={line.label} />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex justify-between px-3 font-medium">
        <span>Total {title.toLowerCase()}</span>
        <span className="tabular-nums">{formatRupiah(total)}</span>
      </p>
    </div>
  );
}
