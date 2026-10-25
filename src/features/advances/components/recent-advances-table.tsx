// Tabel ringkas "Uang muka terbaru" di Beranda. Server Component dengan
// <Table> shadcn biasa: hanya beberapa baris, jadi tidak perlu pencarian,
// urutan, maupun halaman seperti data table di /advances.

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdvanceListItem } from "@/features/advances/queries";
import { formatRupiah } from "@/lib/format";
import { AdvanceStatusBadge } from "./advance-status-badge";

export function RecentAdvancesTable({
  advances,
  showRecipient,
}: {
  advances: AdvanceListItem[];
  showRecipient: boolean;
}) {
  if (advances.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Belum ada uang muka.
      </p>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">No.</TableHead>
            <TableHead>Keperluan</TableHead>
            {showRecipient && <TableHead className="hidden sm:table-cell">Penerima</TableHead>}
            <TableHead className="pr-8 text-right">Nominal</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Detail</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {advances.map((advance) => (
            // Link `after:absolute after:inset-0` membuat seluruh baris bisa diklik.
            <TableRow key={advance.id} className="relative">
              <TableCell className="whitespace-nowrap">
                <Link
                  href={`/advances/${advance.id}`}
                  className="font-medium after:absolute after:inset-0 hover:underline"
                >
                  {advance.number}
                </Link>
              </TableCell>
              <TableCell>
                <span className="block max-w-40 truncate md:max-w-64">{advance.purpose}</span>
              </TableCell>
              {showRecipient && (
                <TableCell className="hidden whitespace-nowrap sm:table-cell">{advance.recipientName}</TableCell>
              )}
              <TableCell className="pr-8 text-right font-medium whitespace-nowrap tabular-nums">
                {formatRupiah(advance.amount)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <AdvanceStatusBadge status={advance.status} disputed={!!advance.disputedAt} />
              </TableCell>
              <TableCell>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
