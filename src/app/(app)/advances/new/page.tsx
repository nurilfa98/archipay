// Halaman /advances/new?project=<id> (push): OWNER mencatat pencairan ke
// karyawan, FINANCE mengusulkan pencairan ke karyawan (menunggu persetujuan
// OWNER). Pengajuan karyawan untuk dirinya sendiri ada di /advances/request.
// Project dipilih lebih dulu di halaman Uang Muka, jadi tidak diminta lagi di sini.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvanceCreateForm } from "@/features/advances/components/advance-create-form";
import { countOverdueAdvances, listApprovers, listRecipientOptions } from "@/features/advances/queries";
import { eligibleApprovers } from "@/features/advances/service";
import { BackToProjectList } from "@/features/projects/components/back-to-list";
import { ProjectBanner } from "@/features/projects/components/project-banner";
import { resolveProjectScope } from "@/features/projects/queries";
import { readProjectParam } from "@/features/projects/schemas";
import { getCompanySettings } from "@/features/settings/queries";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Pencairan Uang Muka",
};

export default function NewAdvancePage({ searchParams }: PageProps<"/advances/new">) {
  return (
    <>
      <BackToProjectList basePath="/advances" label="Daftar uang muka" searchParams={searchParams} />
      <PageHeader
        title="Pencairan uang muka"
        description="Berikan dana operasional kepada karyawan. Karyawan wajib mengonfirmasi penerimaan dan mempertanggungjawabkannya dengan nota."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-xl" />}>
        <NewAdvanceContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewAdvanceContent({ searchParams }: Pick<PageProps<"/advances/new">, "searchParams">) {
  // Dua permission berbeda boleh membuka halaman ini, jadi dicek manual
  // (requirePermission hanya menerima satu permission).
  const user = await verifySession();
  const direct = can(user, "advance:disburse");
  if (!direct && !can(user, "advance:propose")) redirect("/projects");

  // Tanpa project aktif yang valid, kembali ke halaman Project.
  const scope = await resolveProjectScope(readProjectParam(await searchParams));
  if (scope.kind !== "project" || scope.project.status !== "ACTIVE") redirect("/projects");

  const [options, approvers, settings] = await Promise.all([
    listRecipientOptions(user.id),
    direct ? [] : listApprovers(),
    getCompanySettings(),
  ]);
  // Usulan FINANCE: sembunyikan penerima yang tidak punya penyetuju sah
  // (misal satu-satunya OWNER), karena usulannya tidak akan bisa disetujui.
  // Server Action tetap mengecek ulang.
  const recipients = direct
    ? options
    : options.filter(
        (option) => eligibleApprovers(approvers, { recipientId: option.id, createdById: user.id }).length > 0,
      );

  // Penerima yang sudah mencapai batas uang muka tertunda tetap tampil, tetapi
  // form menolak mencatat uang muka baru untuk mereka (dan Server Action mengecek ulang).
  const overdueCounts = await countOverdueAdvances(recipients.map((recipient) => recipient.id));

  return (
    <>
      <ProjectBanner project={scope.project} />
      <Card>
        <CardContent>
          <AdvanceCreateForm
            recipients={recipients}
            mode={direct ? "direct" : "propose"}
            projectId={scope.project.id}
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
