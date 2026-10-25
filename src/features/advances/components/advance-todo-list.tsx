// Kotak "Perlu tindakan Anda" di atas daftar uang muka: konfirmasi terima
// (karyawan), persetujuan (OWNER), pencatatan pencairan (FINANCE/OWNER),
// dan laporan tidak sesuai. Server Component.

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { AdvanceListItem } from "@/features/advances/queries";
import { getAvailableActions, type AdvanceViewer } from "@/features/advances/service";
import { formatRupiah } from "@/lib/format";

export function AdvanceTodoList({
  advances,
  viewer,
}: {
  advances: AdvanceListItem[];
  viewer: AdvanceViewer;
}) {
  if (advances.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="advance-todo-title">
      <h2 id="advance-todo-title" className="text-sm font-medium">
        Perlu tindakan Anda ({advances.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {advances.map((advance) => (
          <li key={advance.id}>
            <Link
              href={`/advances/${advance.id}`}
              className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 p-3 transition-colors hover:bg-brand/10"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-medium">{todoLabel(advance, viewer)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {advance.number} · {formatRupiah(advance.amount)} ·{" "}
                  {advance.recipientId === viewer.id ? advance.purpose : advance.recipientName}
                </p>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function todoLabel(advance: AdvanceListItem, viewer: AdvanceViewer) {
  const actions = getAvailableActions(advance, viewer);
  if (actions.acknowledge) return "Konfirmasi penerimaan dana";
  if (actions.decide) return "Setujui atau tolak pengajuan";
  if (actions.disburse) return "Catat penyerahan dana";
  return "Dilaporkan tidak sesuai oleh karyawan, mohon dicek";
}
