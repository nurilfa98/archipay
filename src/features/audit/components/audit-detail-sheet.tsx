// Panel samping "Detail aktivitas" di halaman Audit Log: siapa, kapan, dari
// mana, dan data apa yang berubah (Sebelum → Sesudah).

"use client";

import { EyeIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuditLogTableRow } from "./audit-log-table";

export function AuditDetailSheet({ row }: { row: AuditLogTableRow }) {
  const hasBefore = row.changes.some((change) => change.before !== null);

  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label="Lihat detail" title="Lihat detail" />}
      >
        <EyeIcon className="size-[18px]" />
      </SheetTrigger>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Detail aktivitas</SheetTitle>
          <SheetDescription>{row.createdAtLabel}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-4">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Item label="Aktivitas">
              <ToneBadge tone={row.tone}>{row.actionLabel}</ToneBadge>
            </Item>
            <Item label="Kategori">{row.categoryLabel}</Item>
            <Item label="Pelaku">
              <span className="block">{row.actorName}</span>
              {row.actorEmail && <span className="block text-xs text-muted-foreground">{row.actorEmail}</span>}
            </Item>
            <Item label="Alamat IP">{row.ipAddress ?? "-"}</Item>
            <Item label={row.entityKind}>
              {row.entityHref ? (
                <Link href={row.entityHref} className="font-medium hover:underline">
                  {row.entityLabel}
                </Link>
              ) : (
                row.entityLabel
              )}
            </Item>
          </dl>

          <section className="flex flex-col gap-2" aria-labelledby={`audit-changes-${row.id}`}>
            <h3 id={`audit-changes-${row.id}`} className="text-sm font-medium">
              Data yang dicatat
            </h3>
            {row.changes.length === 0 ? (
              <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                Tidak ada data tambahan untuk aktivitas ini.
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">Data</TableHead>
                      {hasBefore && <TableHead>Sebelum</TableHead>}
                      <TableHead>{hasBefore ? "Sesudah" : "Nilai"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {row.changes.map((change) => (
                      <TableRow key={change.field}>
                        <TableCell className="align-top whitespace-normal text-muted-foreground">
                          {change.field}
                        </TableCell>
                        {hasBefore && <Value>{change.before}</Value>}
                        <Value>{change.after}</Value>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Value({ children }: { children: string | null }) {
  return (
    // Teks panjang (pernyataan karyawan, user agent) dibungkus, tidak melebar.
    <TableCell className="align-top break-words whitespace-pre-wrap">
      {children ?? <span className="text-muted-foreground">-</span>}
    </TableCell>
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
