// Halaman /projects/[id]/edit: ubah nama, klien, nilai kontrak, dan ikon
// project (khusus OWNER). Status Aktif/Selesai tetap diubah di halaman detail.
//
// params (Promise) baru di-await di dalam <Suspense> agar kerangka halaman
// tetap statis.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectForm } from "@/features/projects/components/project-form";
import { getProjectForEdit } from "@/features/projects/queries";
import { projectIdSchema } from "@/features/projects/schemas";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Ubah Project",
};

export default function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  return (
    <>
      <PageHeader
        title="Ubah project"
        description="Perubahan nama dan klien ikut tampil di uang muka yang sudah ada."
      />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96 w-full max-w-md" />}>
            <EditProjectContent params={params} />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function EditProjectContent({ params }: Pick<PageProps<"/projects/[id]/edit">, "params">) {
  await requirePermission("project:manage");
  const parsed = projectIdSchema.safeParse((await params).id);
  const project = parsed.success ? await getProjectForEdit(parsed.data) : null;
  if (!project) notFound();

  return (
    <ProjectForm
      project={{
        id: project.id,
        name: project.name,
        client: project.client,
        contractValue: project.contractValue,
        icon: project.icon,
      }}
    />
  );
}
