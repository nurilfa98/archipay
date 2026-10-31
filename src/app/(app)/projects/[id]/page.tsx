// Halaman detail project (/projects/[id]), dibuka dengan klik kartu project.
//
// - Semua role yang bisa melihat uang muka: identitas project dan kartu akses
//   Uang Muka & Pertanggungjawaban (hitungan sesuai hak lihat masing-masing).
// - OWNER (project:manage): ubah project (halaman /projects/[id]/edit),
//   tandai selesai / aktifkan lagi,
//   unduh PDF, serta ringkasan keuangan & pengeluaran per kategori.
//
// params (Promise) baru di-await di dalam <Suspense> agar kerangka halaman
// (tombol kembali) tetap statis.

import { PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BackToList } from "@/features/projects/components/back-to-list";
import { CategoryChart } from "@/features/projects/components/expense-charts";
import { FinanceKpis } from "@/features/projects/components/finance-kpis";
import { ProjectAccessCards } from "@/features/projects/components/project-access-cards";
import { projectAccentStyle } from "@/features/projects/components/project-accent";
import { ProjectStatusButton } from "@/features/projects/components/project-dialogs";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { ProjectReportButton } from "@/features/projects/components/project-report-button";
import { PROJECT_STATUS_LABELS } from "@/features/projects/constants";
import { expenseByCategory, listProjectFinance, type ProjectFinanceRow } from "@/features/projects/finance-queries";
import { summarizeFinance } from "@/features/projects/finance-summary";
import { listProjectCards, type ProjectCardData } from "@/features/projects/queries";
import { projectIdSchema } from "@/features/projects/schemas";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Detail project",
};

export default function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <>
      <BackToList href="/projects" label="Daftar project" />
      <Suspense fallback={<DetailSkeleton />}>
        <ProjectDetail params={params} />
      </Suspense>
    </>
  );
}

async function ProjectDetail({ params }: Pick<PageProps<"/projects/[id]">, "params">) {
  const user = await requirePermission("advance:view-own");
  const parsed = projectIdSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const canManage = can(user, "project:manage");

  // OWNER: baris keuangan (sudah berisi hitungan uang muka). Lainnya: hanya
  // hitungan, karyawan sebatas miliknya sendiri.
  let card: ProjectCardData | undefined;
  let finance: ProjectFinanceRow | undefined;
  if (canManage) {
    finance = (await listProjectFinance(user.company.id, { includeAll: true })).find((row) => row.id === id);
    card = finance;
  } else {
    const viewAll = can(user, "advance:view-all");
    card = (
      await listProjectCards({
        companyId: user.company.id,
        recipientId: viewAll ? undefined : user.id,
        includeAll: true,
      })
    ).find((item) => item.id === id);
  }
  if (!card || !card.status) notFound();
  const categories = finance ? await expenseByCategory(user.company.id, id) : [];
  const active = card.status === "ACTIVE";

  return (
    <div style={projectAccentStyle(card.icon)} className="project-accent flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-xl border border-(--project-border) bg-(--project-soft) p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-(--project-strong) text-(--project-on)">
            <ProjectIcon name={card.icon} className="size-7" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{card.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{card.client ?? "Tanpa nama klien"}</span>
              <ToneBadge tone={active ? "success" : "pending"}>{PROJECT_STATUS_LABELS[card.status]}</ToneBadge>
            </div>
          </div>
        </div>
        {finance && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button variant="outline" nativeButton={false} render={<Link href={`/projects/${id}/edit`} />}>
              <PencilIcon />
              Ubah project
            </Button>
            <ProjectStatusButton project={{ id, name: card.name, status: card.status }} />
            <ProjectReportButton projectId={id} projectName={card.name} />
          </div>
        )}
      </div>

      {!active && (
        <p className="text-sm text-muted-foreground">
          Project sudah selesai: tidak bisa dipakai untuk uang muka baru, tetapi daftar dan laporannya tetap bisa dibuka.
        </p>
      )}

      <ProjectAccessCards
        projectId={id}
        stats={card.stats}
        showAdvances={can(user, "advance:view-own")}
        showSettlements={can(user, "advance:view-own")}
      />

      {finance && (
        <section className="flex flex-col gap-4" aria-labelledby="project-finance-title">
          <h2 id="project-finance-title" className="text-sm font-medium">
            Keuangan project
          </h2>
          <FinanceKpis totals={summarizeFinance([finance])} scope="project" />
          <CategoryChart categories={categories} description="Nota yang disetujui di project ini." />
        </section>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
