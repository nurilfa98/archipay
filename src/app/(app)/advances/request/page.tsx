// Halaman /advances/request?project=<id>: karyawan mengajukan uang muka untuk
// DIRINYA SENDIRI (alur pull). Tidak ada pilihan karyawan; Server Action selalu
// memakai user yang login sebagai penerima. Project dipilih lebih dulu di
// halaman Uang Muka (kartu project), jadi form ini tidak meminta project lagi.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvanceCreateForm } from "@/features/advances/components/advance-create-form";
import { countOverdueAdvances, getActiveRecipient } from "@/features/advances/queries";
import { BackToProjectList } from "@/features/projects/components/back-to-list";
import { ProjectBanner } from "@/features/projects/components/project-banner";
import { resolveProjectScope } from "@/features/projects/queries";
import { readProjectParam } from "@/features/projects/schemas";
import { getCompanySettings } from "@/features/settings/queries";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Ajukan Uang Muka",
};

export default function RequestAdvancePage({ searchParams }: PageProps<"/advances/request">) {
  return (
    <>
      <BackToProjectList basePath="/advances" label="Daftar uang muka" searchParams={searchParams} />
      <PageHeader
        title="Ajukan uang muka"
        description="Ajukan dana operasional untuk keperluan pekerjaan. Owner akan meninjau pengajuan Anda."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-xl" />}>
        <RequestAdvanceContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function RequestAdvanceContent({ searchParams }: Pick<PageProps<"/advances/request">, "searchParams">) {
  const user = await requirePermission("advance:request");
  // Tanpa project aktif yang valid, kembali ke halaman Project.
  const companyId = user.company.id;
  const scope = await resolveProjectScope(companyId, readProjectParam(await searchParams));
  if (scope.kind !== "project" || scope.project.status !== "ACTIVE") redirect("/projects");

  const [self, settings] = await Promise.all([
    getActiveRecipient(companyId, user.id),
    getCompanySettings(companyId),
  ]);
  // verifySession sudah memastikan user aktif; ini hanya pengaman tipe.
  if (!self) redirect("/login");
  const overdueCounts = await countOverdueAdvances(companyId, [self.id]);

  return (
    <>
      <ProjectBanner project={scope.project} />
      <Card>
        <CardContent>
          <AdvanceCreateForm
            mode="request"
            projectId={scope.project.id}
            self={self}
            settlementDueDays={settings.settlementDueDays}
            returnDueDays={settings.returnDueDays}
            overdueCounts={overdueCounts}
            maxOverdueAdvances={settings.maxOverdueAdvances}
          />
        </CardContent>
      </Card>
    </>
  );
}
