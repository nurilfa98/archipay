// Kartu ringkasan uang muka di Beranda. Server Component.
//
// Definisinya mengikuti alur bisnis saat ini (belum ada saldo kas kecil):
//   Dana beredar    = sudah dicairkan, nota belum diverifikasi
//                     (Menunggu konfirmasi, Diterima karyawan, Nota menunggu
//                     verifikasi, Nota perlu diperbaiki)
//   Menunggu proses = Menunggu persetujuan + Disetujui (belum dicairkan)
//   Menunggu nota   = Diterima karyawan + Nota perlu diperbaiki; ditandai bila
//                     lewat batas unggah nota
// Owner/Finance melihat seluruh perusahaan, karyawan hanya miliknya sendiri.

import { ClockIcon, ReceiptTextIcon, WalletIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdvanceStatus } from "@/features/advances/constants";
import type { AdvanceSummary } from "@/features/advances/queries";
import { formatRupiah } from "@/lib/format";

export function AdvanceSummaryCards({ summary }: { summary: AdvanceSummary }) {
  const outstanding = total(summary, ["DISBURSED", "ACKNOWLEDGED", "SUBMITTED", "REVISION_REQUESTED"]);
  const inProcess = total(summary, ["PENDING_APPROVAL", "APPROVED"]);
  const awaitingReceipt = total(summary, ["ACKNOWLEDGED", "REVISION_REQUESTED"]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryCard
        title="Dana beredar"
        icon={WalletIcon}
        value={formatRupiah(outstanding.amount)}
        note={`${outstanding.count} uang muka sudah cair, nota belum diverifikasi`}
      />
      <SummaryCard
        title="Menunggu proses"
        icon={ClockIcon}
        value={`${inProcess.count} uang muka`}
        note={`${formatRupiah(inProcess.amount)} menunggu persetujuan atau pencairan`}
      />
      <SummaryCard
        title="Menunggu nota"
        icon={ReceiptTextIcon}
        value={`${awaitingReceipt.count} uang muka`}
        note={
          awaitingReceipt.overdueCount > 0 ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {awaitingReceipt.overdueCount} lewat batas unggah nota
            </span>
          ) : (
            "Semua masih dalam batas waktu"
          )
        }
      />
    </div>
  );
}

function total(summary: AdvanceSummary, statuses: AdvanceStatus[]) {
  return statuses.reduce(
    (sum, status) => ({
      count: sum.count + summary[status].count,
      amount: sum.amount + summary[status].amount,
      overdueCount: sum.overdueCount + summary[status].overdueCount,
    }),
    { count: 0, amount: 0, overdueCount: 0 },
  );
}

function SummaryCard({
  title,
  icon: Icon,
  value,
  note,
}: {
  title: string;
  icon: LucideIcon;
  value: string;
  note: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardDescription>{title}</CardDescription>
        <div className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon className="size-4" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
