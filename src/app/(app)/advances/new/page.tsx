// Halaman /advances/new (push): OWNER mencatat pencairan ke karyawan, FINANCE
// mengusulkan pencairan ke karyawan (menunggu persetujuan OWNER).
// Pengajuan karyawan untuk dirinya sendiri ada di /advances/request.

import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvanceCreateForm } from "@/features/advances/components/advance-create-form";
import { listRecipientOptions } from "@/features/advances/queries";
import { getCompanySettings } from "@/features/settings/queries";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Pencairan Uang Muka",
};

export default function NewAdvancePage() {
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/advances" />}>
          <ArrowLeftIcon />
          Daftar uang muka
        </Button>
      </div>
      <PageHeader
        title="Pencairan uang muka"
        description="Berikan dana operasional kepada karyawan. Karyawan wajib mengonfirmasi penerimaan dan mempertanggungjawabkannya dengan nota."
      />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96 w-full max-w-xl" />}>
            <NewAdvanceContent />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function NewAdvanceContent() {
  // Dua permission berbeda boleh membuka halaman ini, jadi dicek manual
  // (requirePermission hanya menerima satu permission).
  const user = await verifySession();
  const direct = can(user, "advance:disburse");
  if (!direct && !can(user, "advance:propose")) redirect("/advances");

  const [recipients, settings] = await Promise.all([
    listRecipientOptions(user.id),
    getCompanySettings(),
  ]);

  return (
    <AdvanceCreateForm
      recipients={recipients}
      mode={direct ? "direct" : "propose"}
      settlementDueDays={settings.settlementDueDays}
      returnDueDays={settings.returnDueDays}
    />
  );
}
