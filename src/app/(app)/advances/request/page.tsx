// Halaman /advances/request: karyawan mengajukan uang muka untuk DIRINYA
// SENDIRI (alur pull). Tidak ada pilihan karyawan; Server Action selalu
// memakai user yang login sebagai penerima.

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
import { countOverdueAdvances, getActiveRecipient } from "@/features/advances/queries";
import { getCompanySettings } from "@/features/settings/queries";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Ajukan Uang Muka",
};

export default function RequestAdvancePage() {
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/advances" />}>
          <ArrowLeftIcon />
          Daftar uang muka
        </Button>
      </div>
      <PageHeader
        title="Ajukan uang muka"
        description="Ajukan dana operasional untuk keperluan pekerjaan. Owner akan meninjau pengajuan Anda."
      />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96 w-full max-w-xl" />}>
            <RequestAdvanceContent />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function RequestAdvanceContent() {
  const user = await requirePermission("advance:request");
  const [self, settings] = await Promise.all([getActiveRecipient(user.id), getCompanySettings()]);
  // verifySession sudah memastikan user aktif; ini hanya pengaman tipe.
  if (!self) redirect("/login");
  const overdueCounts = await countOverdueAdvances([self.id]);

  return (
    <AdvanceCreateForm
      mode="request"
      self={self}
      settlementDueDays={settings.settlementDueDays}
      returnDueDays={settings.returnDueDays}
      overdueCounts={overdueCounts}
      maxOverdueAdvances={settings.maxOverdueAdvances}
    />
  );
}
