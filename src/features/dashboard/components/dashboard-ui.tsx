// Bahan penyusun kartu Beranda (Karyawan, Finance, Admin HR): kartu bagian
// dengan judul + tautan "Lihat semua", ubin angka, dan ikon bulat berwarna.
// Server Component; tanpa state.

import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TILE_TONES = {
  brand: "bg-brand/10 text-brand",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
} as const;

export type TileTone = keyof typeof TILE_TONES;

// Ikon bulat berwarna.
export function IconTile({
  icon: Icon,
  tone = "brand",
  className,
}: {
  icon: LucideIcon;
  tone?: TileTone;
  className?: string;
}) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TILE_TONES[tone], className)}>
      <Icon className="size-5" />
    </span>
  );
}

// Kartu satu bagian Beranda. `href` = tautan "Lihat semua" di kanan judul.
export function SectionCard({
  title,
  icon,
  tone = "brand",
  href,
  hrefLabel = "Lihat semua",
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  tone?: TileTone;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5", className)}>
      <div className="flex items-center gap-3">
        <IconTile icon={icon} tone={tone} />
        <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 text-sm font-medium text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {hrefLabel}
            <ChevronRightIcon className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// Ubin angka: ikon bulat + angka besar + label. Dipakai 2 kolom di HP.
export function StatTile({
  icon,
  label,
  value,
  tone,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone: TileTone;
  href?: string;
}) {
  const body = (
    <>
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0">
        <p className="text-2xl leading-none font-semibold tabular-nums">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </>
  );
  const className = "flex items-center gap-3 rounded-xl border bg-background p-3";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-muted/60")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// Baris tindakan/pintasan yang bisa diketuk: ikon, judul, keterangan, angka/badge.
export function LinkRow({
  href,
  icon,
  tone = "brand",
  title,
  description,
  trailing,
}: {
  href: string;
  icon: LucideIcon;
  tone?: TileTone;
  title: string;
  description?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border bg-background p-3 transition-colors hover:bg-muted/60"
    >
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      </div>
      {trailing}
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{children}</p>;
}
