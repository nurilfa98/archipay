// Halaman /users/new: tambah pengguna baru.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { assignableRolesFor, canManageUsers } from "@/features/users/access";
import { UserCreateForm } from "@/features/users/components/user-create-form";
import { verifySession } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Tambah Pengguna",
};

export default function NewUserPage() {
  return (
    <>
      <PageHeader
        title="Tambah pengguna"
        description="Pilih role awal akun. Nomor WhatsApp, role, dan rekening bank bisa diatur setelahnya."
      />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64 w-full max-w-md" />}>
            <NewUserContent />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function NewUserContent() {
  const actor = await verifySession();
  if (!canManageUsers(actor)) redirect("/");
  return <UserCreateForm roles={assignableRolesFor(actor)} />;
}
