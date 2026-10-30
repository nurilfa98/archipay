// Empat kartu ringkasan di Beranda Owner: nilai kontrak, pengeluaran,
// keuntungan, dan dana beredar. Server Component.
//
// Keuntungan hanya dihitung dari project yang nilai kontraknya diisi, supaya
// project tanpa nilai kontrak tidak membuat angkanya tampak rugi.

import { BanknoteIcon, HandshakeIcon, ReceiptTextIcon, TrendingUpIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatPercent, type FinanceTotals } from "../finance-summary";

// scope "project": angka satu project (halaman detail project), teks
// penjelasnya menyesuaikan.
export function FinanceKpis({ totals, scope = "all" }: { totals: FinanceTotals; scope?: "all" | "project" }) {
  const loss = totals.valuedCount > 0 && totals.profit < 0;
  const single = scope === "project";

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        title="Nilai kontrak"
        icon={HandshakeIcon}
        value={totals.valuedCount > 0 ? formatRupiah(totals.contractValue) : "Belum diisi"}
        note={
          single
            ? totals.valuedCount > 0
              ? "Pendapatan project ini"
              : "Isi lewat tombol Ubah project"
            : totals.valuedCount > 0
            ? `Dari ${totals.valuedCount} project${
                totals.activeWithoutValue > 0 ? `, ${totals.activeWithoutValue} project aktif belum diisi` : ""
              }`
            : "Isi nilai kontrak di menu Project"
        }
      />
      <Kpi
        title="Pengeluaran"
        icon={ReceiptTextIcon}
        value={formatRupiah(totals.expense)}
        note={single ? "Nota yang sudah disetujui" : "Nota yang sudah disetujui, semua project"}
      />
      <Kpi
        title={
          totals.provisional
            ? "Keuntungan (sementara)"
            : single && totals.valuedCount > 0
              ? "Keuntungan (final)"
              : "Keuntungan"
        }
        icon={TrendingUpIcon}
        tone={loss ? "danger" : undefined}
        value={totals.valuedCount > 0 ? formatRupiah(totals.profit) : "-"}
        note={
          totals.marginPercent !== null
            ? `Margin ${formatPercent(totals.marginPercent)} dari nilai kontrak`
            : "Muncul setelah nilai kontrak diisi"
        }
      />
      <Kpi
        title="Dana beredar"
        icon={BanknoteIcon}
        value={formatRupiah(totals.outstanding)}
        note="Sudah cair, nota belum diverifikasi. Belum dihitung sebagai pengeluaran"
      />
    </div>
  );
}

function Kpi({
  title,
  icon: Icon,
  value,
  note,
  tone,
}: {
  title: string;
  icon: LucideIcon;
  value: string;
  note: ReactNode;
  tone?: "danger";
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
        <CardTitle
          className={cn("text-xl font-semibold break-words sm:text-2xl", tone === "danger" && "text-rose-600 dark:text-rose-400")}
        >
          {value}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
