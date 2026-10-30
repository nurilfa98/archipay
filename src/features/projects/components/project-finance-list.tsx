// Daftar keuangan per project di Beranda Owner. Server Component.
// Layar lebar: tabel. Layar HP: satu kartu per project (tabel lebar tidak
// nyaman digeser di HP).
//
// Keuntungan project Aktif diberi tanda "sementara" karena pengeluarannya
// masih bisa bertambah; project Selesai dianggap "final".

import Link from "next/link";
import type { ReactNode } from "react";
import { ToneBadge } from "@/components/tone-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NO_PROJECT } from "../constants";
import type { ProjectFinanceRow } from "../finance-queries";
import { formatPercent, NEAR_LIMIT_PERCENT } from "../finance-summary";
import { projectAccentStyle } from "./project-accent";
import { ProjectIcon } from "./project-icon";
import { ProjectReportButton } from "./project-report-button";

export function ProjectFinanceList({ projects }: { projects: ProjectFinanceRow[] }) {
  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Belum ada project. Tambahkan di menu Project.
      </p>
    );
  }

  return (
    <>
      <div className="hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Nilai kontrak</TableHead>
              <TableHead className="min-w-44">Pengeluaran</TableHead>
              <TableHead className="text-right">Keuntungan</TableHead>
              <TableHead className="text-right">Dana beredar</TableHead>
              <TableHead className="w-20 text-right">Laporan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id ?? NO_PROJECT}>
                <TableCell>
                  <ProjectName project={project} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {project.contractValue === null ? (
                    <span className="text-muted-foreground">Belum diisi</span>
                  ) : (
                    formatRupiah(project.contractValue)
                  )}
                </TableCell>
                <TableCell>
                  <ExpenseMeter project={project} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  <Profit project={project} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {project.outstanding > 0 ? formatRupiah(project.outstanding) : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="text-right">
                  {project.id && <ProjectReportButton projectId={project.id} projectName={project.name} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {projects.map((project) => (
          <li key={project.id ?? NO_PROJECT} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <ProjectName project={project} />
            <ExpenseMeter project={project} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Stat label="Nilai kontrak">
                {project.contractValue === null ? (
                  <span className="text-muted-foreground">Belum diisi</span>
                ) : (
                  formatRupiah(project.contractValue)
                )}
              </Stat>
              <Stat label="Keuntungan">
                <Profit project={project} />
              </Stat>
              <Stat label="Dana beredar">{project.outstanding > 0 ? formatRupiah(project.outstanding) : "-"}</Stat>
              <Stat label="Uang muka berjalan">{project.stats.active}</Stat>
            </dl>
            {project.id && (
              <div className="flex justify-end">
                <ProjectReportButton projectId={project.id} projectName={project.name} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function ProjectName({ project }: { project: ProjectFinanceRow }) {
  return (
    <div style={projectAccentStyle(project.id ? project.icon : null)} className="project-accent flex min-w-0 items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--project-strong) text-(--project-on)">
        <ProjectIcon name={project.icon} className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={project.id ? `/projects/${project.id}` : `/advances?project=${NO_PROJECT}`}
            className="truncate font-medium hover:underline"
          >
            {project.name}
          </Link>
          {project.status === "COMPLETED" && <ToneBadge tone="pending">Selesai</ToneBadge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {project.client ?? (project.id ? "Tanpa nama klien" : "Uang muka sebelum ada project")}
        </p>
      </div>
    </div>
  );
}

// Pengeluaran + batang pemakaian nilai kontrak. Tanpa nilai kontrak, batang
// tidak punya pembanding sehingga hanya nominalnya yang tampil.
export function ExpenseMeter({
  project,
}: {
  project: Pick<ProjectFinanceRow, "name" | "expense" | "usedPercent">;
}) {
  if (project.usedPercent === null) {
    return <span className="text-sm font-medium tabular-nums">{formatRupiah(project.expense)}</span>;
  }

  const used = project.usedPercent;
  const fill = used > 100 ? "bg-rose-500" : used >= NEAR_LIMIT_PERCENT ? "bg-amber-500" : "bg-brand";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium tabular-nums">{formatRupiah(project.expense)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{formatPercent(used)} dari kontrak</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Pengeluaran ${project.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(used))}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.min(100, used)}%` }} />
      </div>
    </div>
  );
}

function Profit({ project }: { project: ProjectFinanceRow }) {
  if (project.profit === null) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="inline-flex flex-col md:items-end">
      <span className={cn("font-medium", project.profit < 0 && "text-rose-600 dark:text-rose-400")}>
        {formatRupiah(project.profit)}
      </span>
      <span className="text-xs text-muted-foreground">
        {project.marginPercent !== null && `${formatPercent(project.marginPercent)} · `}
        {project.status === "COMPLETED" ? "final" : "sementara"}
      </span>
    </span>
  );
}
