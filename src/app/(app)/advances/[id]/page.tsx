// Halaman /advances/[id]: rincian uang muka + tindakan sesuai peran viewer
// (konfirmasi terima, setujui/tolak, catat pencairan, batalkan), dan link ke
// pertanggungjawabannya setelah dana dikonfirmasi diterima.
//
// Hanya penerima dan pemegang advance:view-all yang boleh membuka; selain itu
// ditampilkan 404 agar keberadaan datanya tidak bocor.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
//   (bagian "With Cache Components" → "Without generateStaticParams")
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md

import { ArrowRightIcon, CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvanceAcknowledgePanel } from "@/features/advances/components/advance-acknowledge-panel";
import { AdvanceManageActions } from "@/features/advances/components/advance-manage-actions";
import { AdvanceStatusBadge } from "@/features/advances/components/advance-status-badge";
import { DISBURSEMENT_METHOD_LABELS, isAwaitingReceipts } from "@/features/advances/constants";
import { getAdvanceDetail, type AdvanceDetail } from "@/features/advances/queries";
import { buildAcknowledgmentText, getAvailableActions } from "@/features/advances/service";
import { NO_PROJECT } from "@/features/projects/constants";
import { AssignProjectDialog } from "@/features/projects/components/assign-project-dialog";
import { BackToList } from "@/features/projects/components/back-to-list";
import { listActiveProjects } from "@/features/projects/queries";
import { SettlementStatusBadge } from "@/features/settlements/components/settlement-status-badge";
import { EDITABLE_ADVANCE_STATUSES, toSettlementStatus } from "@/features/settlements/constants";
import { getSettlementRefByAdvance } from "@/features/settlements/queries";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatAccountNumber } from "@/lib/bank";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Detail Uang Muka",
};

export default function AdvanceDetailPage({ params }: PageProps<"/advances/[id]">) {
  return (
    <Suspense fallback={<AdvanceDetailSkeleton />}>
      {params.then(({ id }) => (
        <AdvanceDetailContent id={id} />
      ))}
    </Suspense>
  );
}

async function AdvanceDetailContent({ id }: { id: string }) {
  const viewer = await requirePermission("advance:view-own");
  const advance = await getAdvanceDetail(viewer.company.id, id);
  if (!advance) notFound();

  const isRecipient = advance.recipientId === viewer.id;
  if (!isRecipient && !can(viewer, "advance:view-all")) notFound();

  const actions = getAvailableActions(advance, viewer);
  const canManage = actions.decide || actions.disburse || actions.cancel;
  // Draf laporan dibuat otomatis saat karyawan mengonfirmasi terima dana.
  const settlement = advance.acknowledgedAt ? await getSettlementRefByAdvance(advance.id) : null;
  const number = advance.number;
  const amount = formatRupiah(advance.amount);

  // Uang muka lama (sebelum ada project) bisa ditetapkan projectnya oleh Owner
  // selama belum berakhir.
  const canAssignProject =
    !advance.projectId && can(viewer, "project:manage") && !isFinished(advance.status);
  const assignableProjects = canAssignProject ? await listActiveProjects(viewer.company.id) : null;

  return (
    <>
      <BackToList
        href={`/advances?project=${advance.projectId ?? NO_PROJECT}`}
        label={advance.projectName ? `Uang muka ${advance.projectName}` : "Daftar uang muka"}
      />
      <PageHeader
        title={number}
        description={advance.purpose}
        action={<AdvanceStatusBadge status={advance.status} disputed={!!advance.disputedAt} />}
      />

      <StatusAlert advance={advance} isRecipient={isRecipient} />

      {actions.acknowledge && (
        <Card>
          <CardHeader>
            <CardTitle>Konfirmasi penerimaan dana</CardTitle>
            <CardDescription>
              Pastikan dana sudah Anda terima sesuai nominal sebelum mengonfirmasi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdvanceAcknowledgePanel
              advanceId={advance.id}
              acknowledgmentText={buildAcknowledgmentText({
                recipientName: advance.recipientName,
                advanceNumber: number,
                amountLabel: amount,
                purpose: advance.purpose,
                settlementDueLabel: formatDate(advance.settlementDueAt!),
                returnDueDays: advance.returnDueDays!,
              })}
              canDispute={actions.dispute}
              disputeReason={advance.disputedAt ? advance.disputeReason : null}
            />
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Tindakan</CardTitle>
          </CardHeader>
          <CardContent>
            <AdvanceManageActions
              advanceId={advance.id}
              actions={actions}
              summary={`${number} · ${amount} untuk ${advance.recipientName}`}
              isTransfer={advance.disbursementMethod === "TRANSFER"}
              wasDisbursed={advance.status === "DISBURSED"}
            />
          </CardContent>
        </Card>
      )}

      {settlement && (
        <SettlementCard
          settlementId={settlement.id}
          settlementNumber={settlement.number}
          advance={advance}
          isRecipient={isRecipient}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rincian</CardTitle>
        </CardHeader>
        <CardContent>
          <AdvanceDetails advance={advance} assignableProjects={assignableProjects} />
        </CardContent>
      </Card>

      {advance.acknowledgedAt && advance.acknowledgmentText && (
        <Card>
          <CardHeader>
            <CardTitle>Pernyataan karyawan</CardTitle>
            <CardDescription>
              Disetujui {advance.recipientName} pada {formatDateTime(advance.acknowledgedAt)}
              {advance.acknowledgmentIp && ` dari IP ${advance.acknowledgmentIp}`}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <blockquote className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
              {advance.acknowledgmentText}
            </blockquote>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// Ringkas: status laporan + tombol ke halaman pertanggungjawaban.
function SettlementCard({
  settlementId,
  settlementNumber,
  advance,
  isRecipient,
}: {
  settlementId: string;
  settlementNumber: string | null;
  advance: AdvanceDetail;
  isRecipient: boolean;
}) {
  const editable = (EDITABLE_ADVANCE_STATUSES as readonly string[]).includes(advance.status);
  const fill = isRecipient && editable;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pertanggungjawaban</CardTitle>
        <CardDescription>
          {fill
            ? `Unggah nota pembelanjaan dari uang muka ini paling lambat ${formatDate(advance.settlementDueAt!)} pukul 23.59.`
            : `${settlementNumber ?? "Draf"} · laporan penggunaan uang muka ini.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <SettlementStatusBadge status={toSettlementStatus(advance.status)} />
        <Button
          variant={fill ? "brand" : "outline"}
          nativeButton={false}
          render={<Link href={`/settlements/${settlementId}`} />}
        >
          {fill ? (advance.status === "REVISION_REQUESTED" ? "Perbaiki nota" : "Isi nota") : "Lihat pertanggungjawaban"}
          <ArrowRightIcon />
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusAlert({ advance, isRecipient }: { advance: AdvanceDetail; isRecipient: boolean }) {
  if (advance.status === "REJECTED") {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Ditolak oleh {advance.decidedByName}</AlertTitle>
        <AlertDescription>{advance.rejectionReason}</AlertDescription>
      </Alert>
    );
  }
  if (advance.status === "CANCELLED") {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>
          Dibatalkan oleh {advance.cancelledByName}
          {advance.cancelledAt && ` · ${formatDateTime(advance.cancelledAt)}`}
        </AlertTitle>
        <AlertDescription>{advance.cancellationReason}</AlertDescription>
      </Alert>
    );
  }
  // Karyawan melihat laporannya sendiri di panel konfirmasi.
  if (advance.status === "DISBURSED" && advance.disputedAt && !isRecipient) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>
          Dilaporkan tidak sesuai oleh {advance.recipientName} · {formatDateTime(advance.disputedAt)}
        </AlertTitle>
        <AlertDescription>
          &ldquo;{advance.disputeReason}&rdquo;. Bila memang keliru, batalkan lalu catat ulang
          pencairan dengan data yang benar.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

function AdvanceDetails({
  advance,
  assignableProjects,
}: {
  advance: AdvanceDetail;
  // Diisi hanya bila viewer boleh menetapkan project untuk uang muka lama ini.
  assignableProjects: { id: string; name: string }[] | null;
}) {
  const isTransfer = advance.disbursementMethod === "TRANSFER";
  // Batas nota terlewati selama nota belum dikirim. Pengingat & tindak
  // lanjutnya dibangun di irisan pengingat & tenggat.
  const settlementOverdue = advance.settlementDueAtPassed && isAwaitingReceipts(advance.status);

  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <Item label="Project">
        {advance.projectName ?? <span className="text-muted-foreground">Tanpa project</span>}
        {assignableProjects && (
          <span className="mt-1 block">
            <AssignProjectDialog advanceId={advance.id} projects={assignableProjects} />
          </span>
        )}
      </Item>
      <Item label="Penerima">
        {advance.recipientName}
        <span className="block text-muted-foreground">{advance.recipientEmail}</span>
      </Item>
      <Item label="Nominal">
        <span className="text-base font-semibold tabular-nums">{formatRupiah(advance.amount)}</span>
      </Item>
      <Item label="Metode pencairan">{DISBURSEMENT_METHOD_LABELS[advance.disbursementMethod]}</Item>
      {isTransfer && advance.disbursedAt && (
        <Item label="Rekening tujuan">
          {advance.destinationBankName && advance.destinationAccountNumber
            ? `${advance.destinationBankName} · ${formatAccountNumber(advance.destinationBankName, advance.destinationAccountNumber)}`
            : "Belum tercatat"}
          {advance.transferReference && (
            <span className="block text-muted-foreground">Ref. {advance.transferReference}</span>
          )}
        </Item>
      )}
      <Item label={advance.createdById === advance.recipientId ? "Diajukan oleh" : "Dicatat oleh"}>
        {advance.createdByName}
        <span className="block text-muted-foreground">{formatDateTime(advance.createdAt)}</span>
      </Item>
      {advance.decidedAt && advance.status !== "REJECTED" && (
        <Item label="Disetujui oleh">
          {advance.decidedByName}
          <span className="block text-muted-foreground">{formatDateTime(advance.decidedAt)}</span>
        </Item>
      )}
      {advance.disbursedAt && (
        <Item label="Dicairkan oleh">
          {advance.disbursedByName}
          <span className="block text-muted-foreground">{formatDateTime(advance.disbursedAt)}</span>
        </Item>
      )}
      {advance.settlementDueAt && (
        <Item label="Batas unggah nota">
          <span className={cn(settlementOverdue && "font-medium text-amber-700 dark:text-amber-300")}>
            {formatDate(advance.settlementDueAt)}, 23.59
            {settlementOverdue && " (terlewati)"}
          </span>
        </Item>
      )}
      {advance.returnDueDays && (
        <Item label="Batas pengembalian sisa dana">
          {advance.returnDueDays} hari kalender setelah pertanggungjawaban diverifikasi
        </Item>
      )}
    </dl>
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

// Uang muka yang sudah berakhir tidak bisa lagi dipindahkan antar project.
function isFinished(status: AdvanceDetail["status"]) {
  return status === "CLOSED" || status === "REJECTED" || status === "CANCELLED";
}

function AdvanceDetailSkeleton() {
  return (
    <>
      <BackToList href="/projects" label="Daftar project" />
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-64 w-full" />
    </>
  );
}
