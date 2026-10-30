// Halaman /projects/new: tambah project baru (khusus OWNER).

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectForm } from "@/features/projects/components/project-form";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Tambah Project",
};

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        title="Tambah project"
        description="Project baru langsung bisa dipakai untuk mengajukan uang muka. Nilai kontrak bisa diisi nanti."
      />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96 w-full max-w-md" />}>
            <NewProjectContent />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function NewProjectContent() {
  await requirePermission("project:manage");
  return <ProjectForm />;
}
