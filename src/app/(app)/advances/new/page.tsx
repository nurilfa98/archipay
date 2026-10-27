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
import { countOverdueAdvances, listApprovers, listRecipientOptions } from "@/features/advances/queries";
import { eligibleApprovers } from "@/features/advances/service";
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
    <AdvanceCreateForm
      recipients={recipients}
      mode={direct ? "direct" : "propose"}
      settlementDueDays={settings.settlementDueDays}
      returnDueDays={settings.returnDueDays}
      overdueCounts={overdueCounts}
      maxOverdueAdvances={settings.maxOverdueAdvances}
    />
  );
}
