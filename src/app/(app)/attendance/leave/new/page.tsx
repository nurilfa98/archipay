// Halaman /attendance/leave/new: ajukan cuti / izin (BUSINESS-FLOW §19.3).

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveRequestForm } from "@/features/attendance/components/leave-request-form";
import { getLeaveQuota, listLeaveTypes } from "@/features/attendance/leave-queries";
import { requirePermission } from "@/lib/auth/dal";
import { zonedDateString } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Ajukan Cuti / Izin",
};

export default function NewLeavePage() {
  return (
    <>
      <PageHeader
        title="Ajukan cuti / izin"
        description="Owner (dan Admin HR, bila ada) diberi tahu lewat WhatsApp. Hasilnya dikirim ke WhatsApp Anda."
      />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96 w-full max-w-xl" />}>
            <NewLeaveContent />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function NewLeaveContent() {
  const user = await requirePermission("attendance:check-in");
  const today = zonedDateString(new Date());
  const [types, quota] = await Promise.all([
    listLeaveTypes(user.company.id, true),
    getLeaveQuota(user.company.id, user.id, Number(today.slice(0, 4))),
  ]);
  return <LeaveRequestForm types={types} quota={quota} today={today} />;
}
