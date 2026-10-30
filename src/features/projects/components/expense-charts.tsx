// Dua grafik pengeluaran di Beranda Owner, dibuat dengan HTML/CSS biasa
// (tanpa library grafik). Satu seri, satu warna (brand), jadi tanpa legenda.
// Server Component.
//
// Aturan tampilan: batang tipis (maks 24px) dengan ujung data membulat,
// angka hanya di batang yang penting, sisanya lewat tooltip (title) dan
// tabel tersembunyi untuk pembaca layar.

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah, formatRupiahCompact } from "@/lib/format";
import type { CategoryExpense, MonthExpense } from "../finance-queries";
import { formatPercent } from "../finance-summary";

export function ExpenseCharts({ categories, months }: { categories: CategoryExpense[]; months: MonthExpense[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CategoryChart categories={categories} />
      <MonthChart months={months} />
    </div>
  );
}

function ChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty() {
  return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada nota yang disetujui.</p>;
}

// Batang mendatar: nama + nominal di baris atas, batang di bawahnya, sehingga
// nama panjang tetap muat di layar HP.
export function CategoryChart({
  categories,
  description = "Nota yang disetujui, semua project.",
}: {
  categories: CategoryExpense[];
  description?: string;
}) {
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  const max = Math.max(...categories.map((category) => category.amount), 1);

  return (
    <ChartCard title="Pengeluaran per kategori" description={description}>
      {categories.length === 0 ? (
        <Empty />
      ) : (
        <ul className="flex flex-col gap-3">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-col gap-1"
              title={`${category.name}: ${formatRupiah(category.amount)}`}
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{category.name}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-medium">{formatRupiah(category.amount)}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {formatPercent((category.amount / total) * 100)}
                  </span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.max(2, (category.amount / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

// Kolom tegak, enam bulan terakhir menurut tanggal di nota. Angka hanya di
// kolom tertinggi dan bulan terakhir.
function MonthChart({ months }: { months: MonthExpense[] }) {
  const max = Math.max(...months.map((month) => month.amount), 0);
  const peak = max > 0 ? months.findIndex((month) => month.amount === max) : -1;
  const last = months.length - 1;

  return (
    <ChartCard title="Pengeluaran per bulan" description="Enam bulan terakhir, menurut tanggal di nota.">
      {max === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="flex h-44 items-end gap-2 border-b pt-6" aria-hidden>
            {months.map((month, index) => (
              <div
                key={month.key}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                title={`${month.label}: ${formatRupiah(month.amount)}`}
              >
                {month.amount > 0 && (index === peak || index === last) && (
                  <span className="text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatRupiahCompact(month.amount)}
                  </span>
                )}
                <div
                  className="w-full max-w-6 rounded-t bg-brand"
                  style={{ height: month.amount > 0 ? `${Math.max(2, (month.amount / max) * 85)}%` : "0%" }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2 text-xs text-muted-foreground" aria-hidden>
            {months.map((month) => (
              <span key={month.key} className="flex-1 text-center">
                {month.label}
              </span>
            ))}
          </div>
          <table className="sr-only">
            <caption>Pengeluaran per bulan</caption>
            <thead>
              <tr>
                <th>Bulan</th>
                <th>Pengeluaran</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.key}>
                  <td>{month.label}</td>
                  <td>{formatRupiah(month.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ChartCard>
  );
}
