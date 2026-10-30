// "Perlu perhatian" di Beranda Owner: hal yang sebaiknya segera dilihat,
// disusun dari data project. Server Component. Bila tidak ada apa-apa,
// tampil pesan bahwa semuanya aman.

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClockIcon,
  FileQuestionIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NO_PROJECT } from "../constants";
import type { ProjectFinanceRow } from "../finance-queries";
import { formatPercent, NEAR_LIMIT_PERCENT } from "../finance-summary";

type Level = "danger" | "warning" | "info";

type Item = { key: string; level: Level; icon: LucideIcon; text: string; hint?: string; href: string };

const LEVEL_STYLES: Record<Level, string> = {
  danger: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  info: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
};

export function AttentionList({ projects }: { projects: ProjectFinanceRow[] }) {
  const items = buildItems(projects);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perlu perhatian</CardTitle>
        <CardDescription>Hal yang sebaiknya segera Anda lihat.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
            Tidak ada yang perlu ditindaklanjuti saat ini.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="group flex items-start gap-3 rounded-lg border p-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", LEVEL_STYLES[item.level])}>
                    <item.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.text}</span>
                    {item.hint && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
                  </span>
                  <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function sumStat(projects: ProjectFinanceRow[], pick: (stats: ProjectFinanceRow["stats"]) => number) {
  return projects.reduce((sum, project) => sum + pick(project.stats), 0);
}

function buildItems(projects: ProjectFinanceRow[]): Item[] {
  const items: Item[] = [];

  // Project per project: yang paling berat dulu (melebihi nilai kontrak), lalu hampir habis.
  for (const project of projects) {
    if (!project.id || project.status !== "ACTIVE" || project.usedPercent === null) continue;
    const href = `/projects/${project.id}`;
    if (project.usedPercent > 100) {
      items.push({
        key: `over-${project.id}`,
        level: "danger",
        icon: AlertTriangleIcon,
        text: `${project.name} melebihi nilai kontrak`,
        hint: `Pengeluaran ${formatRupiah(project.expense)} (${formatPercent(project.usedPercent)} dari nilai kontrak)`,
        href,
      });
    } else if (project.usedPercent >= NEAR_LIMIT_PERCENT) {
      items.push({
        key: `near-${project.id}`,
        level: "warning",
        icon: AlertTriangleIcon,
        text: `${project.name} hampir habis`,
        hint: `Pengeluaran sudah ${formatPercent(project.usedPercent)} dari nilai kontrak`,
        href,
      });
    }
  }

  const overdue = sumStat(projects, (s) => s.overdue);
  if (overdue > 0) {
    items.push({
      key: "overdue",
      level: "danger",
      icon: ClockIcon,
      text: `${overdue} uang muka lewat batas unggah nota`,
      hint: "Karyawan belum mengirim pertanggungjawaban",
      href: "/projects",
    });
  }

  const pendingApproval = sumStat(projects, (s) => s.pendingApproval);
  if (pendingApproval > 0) {
    items.push({
      key: "approval",
      level: "warning",
      icon: ClockIcon,
      text: `${pendingApproval} uang muka menunggu persetujuan`,
      href: "/projects",
    });
  }

  const toVerify = sumStat(projects, (s) => s.toVerify);
  if (toVerify > 0) {
    items.push({
      key: "verify",
      level: "info",
      icon: ClockIcon,
      text: `${toVerify} pertanggungjawaban menunggu verifikasi`,
      href: "/projects",
    });
  }

  const returnPending = sumStat(projects, (s) => s.returnPending);
  if (returnPending > 0) {
    items.push({
      key: "return",
      level: "warning",
      icon: ClockIcon,
      text: `${returnPending} uang muka belum mengembalikan sisa dana`,
      href: "/projects",
    });
  }

  const withoutValue = projects.filter((project) => project.id && project.status === "ACTIVE" && project.contractValue === null);
  if (withoutValue.length > 0) {
    items.push({
      key: "no-value",
      level: "info",
      icon: FileQuestionIcon,
      text: `${withoutValue.length} project aktif belum punya nilai kontrak`,
      hint: "Keuntungannya belum bisa dihitung",
      href: "/projects",
    });
  }

  const legacy = projects.find((project) => project.id === null);
  if (legacy && legacy.stats.active > 0) {
    items.push({
      key: "legacy",
      level: "info",
      icon: FileQuestionIcon,
      text: `${legacy.stats.active} uang muka berjalan belum punya project`,
      hint: "Tetapkan project dari halaman detail uang muka",
      href: `/advances?project=${NO_PROJECT}`,
    });
  }

  return items;
}
