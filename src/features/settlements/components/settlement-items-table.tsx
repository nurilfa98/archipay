// Daftar nota dalam satu laporan. Client Component karena ada tombol hapus
// (selama draf / perlu diperbaiki). Tanggal sudah diformat di server.
//
// File nota dibuka lewat /api/receipts/<id> yang mengecek hak akses dulu,
// lalu menampilkan file dari penyimpanan privat.
//
// Layar lebar: tabel. HP (< md): satu kartu per nota (pola sama dengan
// AdvanceCard di advances-table.tsx), supaya tidak perlu geser ke samping.

"use client";

import { FileTextIcon, ImageIcon, Trash2Icon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { removeSettlementItem } from "@/features/settlements/actions";
import type { ItemVerificationStatus } from "@/features/settlements/constants";
import { formatRupiah } from "@/lib/format";
import { ItemVerificationBadge } from "./settlement-status-badge";

export type SettlementItemRow = {
  id: string;
  receiptDateLabel: string; // "24 Okt 2026"
  categoryName: string;
  description: string;
  amount: number;
  hasReceipt: boolean;
  noReceiptReason: string | null;
  isPdf: boolean;
  fileDeleted: boolean; // file nota dihapus otomatis (lewat masa simpan)
  verificationStatus: ItemVerificationStatus;
  rejectionReason: string | null;
};

export function SettlementItemsTable({
  settlementId,
  items,
  editable,
  showVerification,
}: {
  settlementId: string;
  items: SettlementItemRow[];
  editable: boolean;
  showVerification: boolean; // tampilkan hasil verifikasi per nota
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Belum ada nota. Tekan &ldquo;Tambah nota&rdquo; untuk mulai.
      </p>
    );
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const extraColumns = (showVerification ? 1 : 0) + (editable ? 1 : 0);

  const table = (
    <div className="hidden rounded-lg border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Tanggal</TableHead>
            <TableHead>Keterangan</TableHead>
            <TableHead>Nota</TableHead>
            <TableHead className="pr-8 text-right">Nominal</TableHead>
            {showVerification && <TableHead>Hasil</TableHead>}
            {editable && <TableHead className="w-16 text-center">Aksi</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="align-top whitespace-nowrap">{item.receiptDateLabel}</TableCell>
              <TableCell className="min-w-48 align-top whitespace-normal">
                <span className="block font-medium">{item.description}</span>
                <span className="block text-xs text-muted-foreground">{item.categoryName}</span>
                {item.verificationStatus === "REJECTED" && item.rejectionReason && (
                  <span className="mt-1 block text-xs text-destructive">Ditolak: {item.rejectionReason}</span>
                )}
              </TableCell>
              <TableCell className="align-top">
                <ReceiptLink item={item} />
              </TableCell>
              <TableCell className="pr-8 text-right align-top font-medium whitespace-nowrap tabular-nums">
                {formatRupiah(item.amount)}
              </TableCell>
              {showVerification && (
                <TableCell className="align-top">
                  <ItemVerificationBadge status={item.verificationStatus} />
                </TableCell>
              )}
              {editable && (
                <TableCell className="text-center align-top">
                  <RemoveItemButton settlementId={settlementId} item={item} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total {items.length} nota</TableCell>
            <TableCell className="pr-8 text-right font-semibold whitespace-nowrap tabular-nums">
              {formatRupiah(total)}
            </TableCell>
            {extraColumns > 0 && <TableCell colSpan={extraColumns} />}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );

  return (
    <>
      {table}
      <ul className="flex flex-col gap-2 md:hidden">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium break-words">{item.description}</span>
                <span className="text-xs text-muted-foreground">
                  {item.categoryName} · {item.receiptDateLabel}
                </span>
              </div>
              <span className="font-semibold whitespace-nowrap tabular-nums">{formatRupiah(item.amount)}</span>
            </div>
            {item.verificationStatus === "REJECTED" && item.rejectionReason && (
              <p className="text-xs text-destructive">Ditolak: {item.rejectionReason}</p>
            )}
            <div className="flex items-center justify-between gap-2 border-t pt-2">
              <ReceiptLink item={item} />
              <div className="flex shrink-0 items-center gap-1">
                {showVerification && <ItemVerificationBadge status={item.verificationStatus} />}
                {editable && <RemoveItemButton settlementId={settlementId} item={item} />}
              </div>
            </div>
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 rounded-lg border bg-muted/50 p-3 font-semibold">
          <span>Total {items.length} nota</span>
          <span className="whitespace-nowrap tabular-nums">{formatRupiah(total)}</span>
        </li>
      </ul>
    </>
  );
}

// Tombol hapus satu nota (dipakai tabel dan kartu HP).
function RemoveItemButton({ settlementId, item }: { settlementId: string; item: SettlementItemRow }) {
  return (
    <ActionDialog
      label="Hapus nota"
      icon={<Trash2Icon className="size-[18px]" />}
      variant="destructive"
      title="Hapus nota ini?"
      description={`${item.description} · ${formatRupiah(item.amount)}`}
      confirmLabel="Hapus nota"
      successMessage="Nota dihapus."
      onConfirm={() => removeSettlementItem(settlementId, item.id)}
    />
  );
}

export function ReceiptLink({
  item,
}: {
  item: Pick<SettlementItemRow, "id" | "hasReceipt" | "isPdf" | "noReceiptReason" | "fileDeleted">;
}) {
  if (!item.hasReceipt) {
    return (
      <span className="block max-w-48 text-xs whitespace-normal text-muted-foreground">
        Tanpa nota: {item.noReceiptReason}
      </span>
    );
  }
  if (item.fileDeleted) {
    return (
      <span className="block max-w-48 text-xs whitespace-normal text-muted-foreground">
        Nota sudah dihapus (lewat masa simpan)
      </span>
    );
  }
  const Icon = item.isPdf ? FileTextIcon : ImageIcon;
  return (
    <a
      href={`/api/receipts/${item.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
    >
      <Icon className="size-4" />
      Lihat
    </a>
  );
}
