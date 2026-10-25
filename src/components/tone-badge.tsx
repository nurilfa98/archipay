// Badge berwarna sesuai arti status (aturan warna ArchiPay). Semua badge
// status di aplikasi memakai komponen ini, supaya satu arti = satu warna.
//
//   success = selesai/berhasil (emerald)    active  = sedang berjalan (indigo)
//   pending = menunggu/netral (slate)       warning = menunggu bayar/terlambat (amber)
//   danger  = ditolak/bermasalah (rose)
//
// Fitur memetakan statusnya sendiri ke salah satu tone, misalnya
// features/advances/components/advance-status-badge.tsx.

import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Tone = "success" | "active" | "pending" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  success:
    "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  active:
    "border-indigo-200 bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300",
  pending:
    "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  warning:
    "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  danger:
    "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
};

export function ToneBadge({
  tone,
  className,
  ...props
}: { tone: Tone } & Omit<ComponentProps<typeof Badge>, "variant">) {
  return <Badge variant="outline" className={cn(TONES[tone], className)} {...props} />;
}
