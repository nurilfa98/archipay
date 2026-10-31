// Halaman /settlements/[id]: satu laporan pertanggungjawaban. Isinya
// menyesuaikan peran viewer dan status laporan:
// - Karyawan penerima, draf / perlu diperbaiki: tambah & hapus nota, kirim.
// - OWNER/FINANCE (bukan penerima), menunggu verifikasi: setujui/tolak per
//   nota, selesaikan, atau kembalikan untuk diperbaiki.
// - OWNER/FINANCE, setelah diverifikasi: catat pengembalian sisa dana atau
//   pembayaran penggantian (boleh dicicil) sampai saldo 0.
// - Selain itu: hanya baca, plus riwayat saldo (ledger) setelah diverifikasi.
//
// Hanya penerima dan pemegang advance:view-all yang boleh membuka; selain itu
// 404 agar keberadaan datanya tidak bocor.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md

import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NO_PROJECT } from "@/features/projects/constants";
import { BackToList } from "@/features/projects/components/back-to-list";
import { SettlementBalanceAction } from "@/features/settlements/components/settlement-balance-action";
import { SettlementItemForm } from "@/features/settlements/components/settlement-item-form";
import {
  SettlementItemsTable,
  type SettlementItemRow,
} from "@/features/settlements/components/settlement-items-table";
import { LateReasonIndicator } from "@/features/settlements/components/late-reason-indicator";
import { SettlementStatusBadge } from "@/features/settlements/components/settlement-status-badge";
import { SettlementSubmitButton } from "@/features/settlements/components/settlement-submit-button";
import { SettlementVerifyForm } from "@/features/settlements/components/settlement-verify-form";
import { LEDGER_ENTRY_LABELS, LEDGER_METHOD_LABELS } from "@/features/settlements/constants";
import {
  getSettlementDetail,
  listExpenseCategories,
  listLedgerEntries,
  listSettlementItems,
  type LedgerEntry,
  type SettlementDetail,
  type SettlementItem,
} from "@/features/settlements/queries";
import { getSettlementActions } from "@/features/settlements/service";
import { getCompanySettings } from "@/features/settings/queries";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatDateOnly, formatDateTime, zonedDateString } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Detail Pertanggungjawaban",
};

export default function SettlementDetailPage({ params }: PageProps<"/settlements/[id]">) {
  return (
    <Suspense fallback={<SettlementDetailSkeleton />}>
      {params.then(({ id }) => (
        <SettlementDetailContent id={id} />
      ))}
    </Suspense>
  );
}

async function SettlementDetailContent({ id }: { id: string }) {
  const viewer = await requirePermission("advance:view-own");
  const settlement = await getSettlementDetail(viewer.company.id, id);
  if (!settlement) notFound();

  const isRecipient = settlement.recipientId === viewer.id;
  if (!isRecipient && !can(viewer, "advance:view-all")) notFound();

  const items = await listSettlementItems(settlement.id);
  const actions = getSettlementActions({ ...settlement, itemCount: items.length }, viewer);
  const verified = !!settlement.verifiedAt;
  const [categories, settings, ledger] = await Promise.all([
    actions.edit ? listExpenseCategories(viewer.company.id) : [],
    actions.edit ? getCompanySettings(viewer.company.id) : null,
    verified ? listLedgerEntries(settlement.advanceId) : [],
  ]);

  const rows = items.map(toItemRow);
  const itemTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const title = settlement.number ?? "Draf pertanggungjawaban";
  // Saldo terkini dari ledger (setelah pengembalian/penggantian/potong gaji).
  const currentBalance = ledger.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <>
      <BackToList
        href={`/settlements?project=${settlement.projectId ?? NO_PROJECT}`}
        label={
          settlement.projectName ? `Pertanggungjawaban ${settlement.projectName}` : "Daftar pertanggungjawaban"
        }
      />
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            <LateReasonIndicator reason={settlement.lateReason} />
          </span>
        }
        description={`${settlement.projectName ? `${settlement.projectName} · ` : ""}${settlement.advanceNumber} · ${settlement.purpose}`}
        action={<SettlementStatusBadge status={settlement.status} />}
      />

      <StatusAlert settlement={settlement} isRecipient={isRecipient} currentBalance={currentBalance} />

      {(actions.recordReturn || actions.recordReimbursement) && (
        <Card>
          <CardHeader>
            <CardTitle>Penyelesaian saldo</CardTitle>
            <CardDescription>
              {actions.recordReturn
                ? `Sisa dana yang belum dikembalikan ${settlement.recipientName}: ${formatRupiah(currentBalance)}.`
                : `Kekurangan yang belum dibayar kantor ke ${settlement.recipientName}: ${formatRupiah(-currentBalance)}.`}{" "}
              Boleh dicatat bertahap (dicicil).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettlementBalanceAction
              settlementId={settlement.id}
              kind={actions.recordReturn ? "return" : "reimburse"}
              outstanding={Math.abs(currentBalance)}
              summary={`${title} · ${settlement.recipientName}`}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan</CardTitle>
        </CardHeader>
        <CardContent>
          <SettlementSummary
            settlement={settlement}
            itemTotal={itemTotal}
            currentBalance={verified ? currentBalance : null}
          />
        </CardContent>
      </Card>

      {actions.verify ? (
        <Card>
          <CardHeader>
            <CardTitle>Verifikasi nota</CardTitle>
            <CardDescription>
              Periksa setiap nota, lalu setujui atau tolak. Nota yang ditolak tidak mengurangi saldo,
              sehingga nominalnya menjadi bagian sisa yang wajib dikembalikan karyawan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettlementVerifyForm
              settlementId={settlement.id}
              items={rows}
              advanceAmount={settlement.advanceAmount}
              summary={`${title} · ${settlement.recipientName}`}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nota</CardTitle>
            {actions.edit && (
              <CardDescription>
                Tambahkan semua nota pembelanjaan dari uang muka ini, lalu kirim untuk diverifikasi.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SettlementItemsTable
              settlementId={settlement.id}
              items={rows}
              editable={actions.edit}
              showVerification={verified}
            />
            {actions.edit && settings && (
              <>
                <SettlementItemForm
                  settlementId={settlement.id}
                  categories={categories}
                  minDate={zonedDateString(settlement.disbursedAt!)}
                  noReceiptMaxAmount={settings.noReceiptMaxAmount}
                />
                <div className="flex justify-end border-t pt-4">
                  <SettlementSubmitButton
                    settlementId={settlement.id}
                    itemCount={items.length}
                    itemTotal={itemTotal}
                    advanceAmount={settlement.advanceAmount}
                    isResubmission={settlement.advanceStatus === "REVISION_REQUESTED"}
                    isLate={settlement.settlementDueAtPassed}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {ledger.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat saldo</CardTitle>
            <CardDescription>
              Setiap perpindahan dana dicatat sebagai baris baru dan tidak pernah diubah.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LedgerTable entries={ledger} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function toItemRow(item: SettlementItem): SettlementItemRow {
  return {
    id: item.id,
    receiptDateLabel: formatDateOnly(item.receiptDate),
    categoryName: item.categoryName,
    description: item.description,
    amount: item.amount,
    hasReceipt: item.hasReceipt,
    noReceiptReason: item.noReceiptReason,
    isPdf: item.fileContentType === "application/pdf",
    verificationStatus: item.verificationStatus,
    rejectionReason: item.rejectionReason,
  };
}

function StatusAlert({
  settlement,
  isRecipient,
  currentBalance: balance,
}: {
  settlement: SettlementDetail;
  isRecipient: boolean;
  currentBalance: number;
}) {
  const returnOverdue = settlement.returnOverdue;
  switch (settlement.status) {
    case "REVISION_REQUESTED":
      return (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>
            Dikembalikan untuk diperbaiki oleh {settlement.revisionRequestedByName}
            {settlement.revisionRequestedAt && ` · ${formatDateTime(settlement.revisionRequestedAt)}`}
          </AlertTitle>
          <AlertDescription>&ldquo;{settlement.revisionNote}&rdquo;</AlertDescription>
        </Alert>
      );
    case "SUBMITTED":
      return isRecipient ? (
        <Alert>
          <InfoIcon />
          <AlertTitle>Menunggu verifikasi Owner/Finance</AlertTitle>
          <AlertDescription>Anda akan menerima WhatsApp setelah nota diverifikasi.</AlertDescription>
        </Alert>
      ) : null;
    case "RETURN_PENDING":
      return (
        <Alert variant={returnOverdue ? "destructive" : "default"}>
          <CircleAlertIcon />
          <AlertTitle>
            {isRecipient ? "Kembalikan sisa dana" : "Menunggu pengembalian sisa dana"} {formatRupiah(balance)}
          </AlertTitle>
          <AlertDescription>
            {settlement.returnDueAt &&
              `Batas pengembalian ${formatDate(settlement.returnDueAt)} pukul 23.59${returnOverdue ? " (terlewati)" : ""}. `}
            {returnOverdue
              ? "Sisa dana sudah masuk daftar potong gaji."
              : isRecipient
                ? "Serahkan sisa dana kepada Owner/Finance. Bila melewati batas, sisa dana dipotong dari gaji sesuai pernyataan Anda."
                : "Catat pengembalian setelah uang diterima."}
          </AlertDescription>
        </Alert>
      );
    case "REIMBURSE_PENDING":
      return (
        <Alert>
          <InfoIcon />
          <AlertTitle>
            {isRecipient ? "Kantor akan mengganti kekurangan" : "Kantor wajib mengganti kekurangan"}{" "}
            {formatRupiah(-balance)}
          </AlertTitle>
          <AlertDescription>
            {isRecipient
              ? "Owner/Finance akan mencatatnya setelah uang diserahkan kepada Anda."
              : "Catat pembayaran setelah uang diserahkan ke karyawan."}
          </AlertDescription>
        </Alert>
      );
    case "CLOSED":
      return (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>Selesai</AlertTitle>
          <AlertDescription>Saldo uang muka sudah lunas. Rinciannya ada di Riwayat saldo.</AlertDescription>
        </Alert>
      );
    default:
      return null;
  }
}

function SettlementSummary({
  settlement,
  itemTotal,
  currentBalance,
}: {
  settlement: SettlementDetail;
  itemTotal: number;
  currentBalance: number | null; // null sebelum diverifikasi
}) {
  const verified = settlement.approvedAmount !== null && settlement.balanceAmount !== null;
  // Sebelum verifikasi: perkiraan dari total nota. Sesudahnya: angka resmi dari ledger.
  const spent = verified ? settlement.approvedAmount! : itemTotal;
  const balance = verified ? settlement.balanceAmount! : settlement.advanceAmount - itemTotal;
  const overdue = settlement.settlementDueAtPassed && settlement.status === "DRAFT";

  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Item label="Penerima">{settlement.recipientName}</Item>
      <Item label="Uang muka">
        <Link href={`/advances/${settlement.advanceId}`} className="font-medium text-brand hover:underline">
          {settlement.advanceNumber}
        </Link>
      </Item>
      <Item label="Dana diterima">
        <span className="font-semibold tabular-nums">{formatRupiah(settlement.advanceAmount)}</span>
      </Item>
      <Item label={verified ? "Nota disetujui" : "Total nota"}>
        <span className="font-semibold tabular-nums">{formatRupiah(spent)}</span>
      </Item>
      <Item label={balance > 0 ? "Sisa dikembalikan" : balance < 0 ? "Kekurangan diganti kantor" : "Selisih"}>
        <span className="text-base font-semibold tabular-nums">{formatRupiah(Math.abs(balance))}</span>
        {!verified && <span className="block text-xs text-muted-foreground">Perkiraan, sebelum diverifikasi</span>}
      </Item>
      {currentBalance !== null && currentBalance !== balance && (
        <Item label="Sisa saldo saat ini">
          <span className="text-base font-semibold tabular-nums">{formatRupiah(Math.abs(currentBalance))}</span>
          <span className="block text-xs text-muted-foreground">
            {currentBalance === 0 ? "Lunas" : currentBalance > 0 ? "belum dikembalikan" : "belum dibayar kantor"}
          </span>
        </Item>
      )}
      {settlement.returnDueAt && (
        <Item label="Batas pengembalian sisa">
          <span className={cn(settlement.returnOverdue && "font-medium text-amber-700 dark:text-amber-300")}>
            {formatDate(settlement.returnDueAt)}, 23.59
            {settlement.returnOverdue && " (terlewati)"}
          </span>
        </Item>
      )}
      {settlement.settlementDueAt && (
        <Item label="Batas unggah nota">
          <span className={cn(overdue && "font-medium text-amber-700 dark:text-amber-300")}>
            {formatDate(settlement.settlementDueAt)}, 23.59
            {overdue && " (terlewati)"}
          </span>
        </Item>
      )}
      {settlement.submittedAt && (
        <Item label="Dikirim">
          {formatDateTime(settlement.submittedAt)}
          {settlement.submittedLate && (
            <span className="block text-xs font-medium text-amber-700 dark:text-amber-300">
              Melewati batas unggah nota
            </span>
          )}
        </Item>
      )}
      {settlement.verifiedAt && (
        <Item label="Diverifikasi oleh">
          {settlement.verifiedByName}
          <span className="block text-muted-foreground">{formatDateTime(settlement.verifiedAt)}</span>
        </Item>
      )}
    </dl>
  );
}

function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  const balance = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Waktu</TableHead>
            <TableHead>Keterangan</TableHead>
            <TableHead className="pr-8 text-right">Nominal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="align-top whitespace-nowrap">{formatDateTime(entry.createdAt)}</TableCell>
              <TableCell className="min-w-48 align-top whitespace-normal">
                <span className="block font-medium">{LEDGER_ENTRY_LABELS[entry.type] ?? entry.type}</span>
                <span className="block text-xs text-muted-foreground">
                  {[
                    entry.method && LEDGER_METHOD_LABELS[entry.method],
                    entry.payrollPeriod && `periode ${entry.payrollPeriod}`,
                    entry.reference && `ref. ${entry.reference}`,
                    entry.note,
                    `oleh ${entry.createdByName}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </TableCell>
              <TableCell
                className={cn(
                  "pr-8 text-right align-top font-medium whitespace-nowrap tabular-nums",
                  entry.amount < 0 && "text-muted-foreground",
                )}
              >
                {entry.amount > 0 ? "+" : "−"}
                {formatRupiah(Math.abs(entry.amount))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Saldo</TableCell>
            <TableCell className="pr-8 text-right font-semibold whitespace-nowrap tabular-nums">
              {balance < 0 && "−"}
              {formatRupiah(Math.abs(balance))}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SettlementDetailSkeleton() {
  return (
    <>
      <BackToList href="/projects" label="Daftar project" />
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </>
  );
}
