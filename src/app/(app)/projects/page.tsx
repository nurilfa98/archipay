// Halaman /projects (Project): pintu masuk uang muka & pertanggungjawaban.
// Semua role yang bisa melihat uang muka membuka halaman ini.
//
// - Satu daftar kartu project, terbaru dulu (created_at desc) agar project baru
//   selalu di kiri atas. Bisa dicari per nama project atau klien, langsung
//   saat mengetik (minimal 3 karakter, disaring di browser).
// - Kartu project: klik = detail project; badge Uang Muka / Pertanggungjawaban
//   langsung membuka daftar yang sudah terikat ke project itu; pojok kanan
//   bawah = status project (informasi saja, diubah di halaman detail).
// - OWNER: melihat nilai kontrak & pengeluaran di kartu dan menambah project
//   (halaman /projects/new).
//   Semua project tampil, termasuk yang selesai tanpa uang muka.
// - FINANCE & karyawan: hitungan uang muka saja (karyawan miliknya sendiri).
//   Project selesai / "Tanpa project" hanya muncul bila ada uang mukanya.
//
// Polanya sama dengan halaman lain: judul statis di luar <Suspense>, cek
// permission & data di dalamnya.

import { InfoIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NO_PROJECT } from "@/features/projects/constants";
import { ProjectCard, type ProjectCardFinance } from "@/features/projects/components/project-card";
import { ProjectSearchList } from "@/features/projects/components/project-search";
import { listProjectFinance } from "@/features/projects/finance-queries";
import { listProjectCards, type ProjectCardData } from "@/features/projects/queries";
import { requirePermission, verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Project",
};

type Tile = { card: ProjectCardData; finance?: ProjectCardFinance };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Project"
        description="Uang muka dan pertanggungjawaban diajukan per project."
        action={
          <Suspense>
            <HeaderAction />
          </Suspense>
        }
      />
      <Suspense fallback={<ProjectsSkeleton />}>
        <ProjectsContent />
      </Suspense>
    </>
  );
}

async function HeaderAction() {
  const user = await verifySession();
  if (!can(user, "project:manage")) return null;
  return (
    <Button nativeButton={false} render={<Link href="/projects/new" />}>
      <PlusIcon />
      Tambah project
    </Button>
  );
}

async function ProjectsContent() {
  const user = await requirePermission("advance:view-own");
  const tiles = (
    can(user, "project:manage") ? await ownerTiles() : await viewerTiles(user.id, can(user, "advance:view-all"))
  ).sort(byNewest);

  const showAdvances = can(user, "advance:view-own");
  const showSettlements = can(user, "settlement:submit");

  if (tiles.length === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-dashed p-6 text-sm">
        <p className="font-medium">Belum ada project.</p>
        <p className="text-muted-foreground">
          {can(user, "project:manage")
            ? "Klik \"Tambah project\" agar uang muka bisa diajukan."
            : "Hubungi Owner untuk menambahkan project."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <InfoIcon />
        <AlertDescription>
          Klik kartu untuk melihat detail project. Badge <strong>Uang Muka</strong> dan{" "}
          <strong>Pertanggungjawaban</strong> langsung membuka daftarnya di project itu.
        </AlertDescription>
      </Alert>

      {/* Kartu dirender di server; pencarian menyaringnya langsung di browser. */}
      <ProjectSearchList
        entries={tiles.map((tile) => ({
          key: tile.card.id ?? NO_PROJECT,
          searchText: `${tile.card.name} ${tile.card.client ?? ""}`,
          card: (
            <ProjectCard
              card={tile.card}
              finance={tile.finance}
              showAdvances={showAdvances}
              showSettlements={showSettlements}
            />
          ),
        }))}
      />
    </div>
  );
}

// OWNER: semua project beserta nilai kontrak & pengeluaran.
async function ownerTiles(): Promise<Tile[]> {
  const rows = await listProjectFinance({ includeAll: true });
  return rows.map((row) => ({
    card: row,
    finance: { contractValue: row.contractValue, expense: row.expense, usedPercent: row.usedPercent },
  }));
}

// FINANCE melihat hitungan seluruh karyawan, karyawan hanya miliknya.
async function viewerTiles(userId: string, viewAll: boolean): Promise<Tile[]> {
  const cards = await listProjectCards({ recipientId: viewAll ? undefined : userId });
  return cards.map((card) => ({ card }));
}

// Project terbaru dulu; "Tanpa project" (createdAt null) paling akhir.
function byNewest(a: Tile, b: Tile) {
  return (b.card.createdAt?.getTime() ?? -Infinity) - (a.card.createdAt?.getTime() ?? -Infinity);
}

function ProjectsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Skeleton className="h-52" />
      <Skeleton className="h-52" />
      <Skeleton className="h-52" />
    </div>
  );
}
