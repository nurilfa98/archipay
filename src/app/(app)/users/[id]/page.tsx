// Halaman /users/[id]: detail, edit, reset password, dan aktif/nonaktif.
//
// [id] adalah dynamic segment. Dengan cacheComponents, nilai params baru
// diketahui saat request, jadi aksesnya wajib di dalam <Suspense>.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
//   (bagian "With Cache Components" → "Without generateStaticParams")
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md

import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAccountActions } from "@/features/users/components/user-account-actions";
import { UserEditForm } from "@/features/users/components/user-edit-form";
import { StatusBadge } from "@/features/users/components/users-table";
import { getUserDetail } from "@/features/users/queries";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Detail Pengguna",
};

export default function UserDetailPage({ params }: PageProps<"/users/[id]">) {
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/users" />}>
          <ArrowLeftIcon />
          Daftar pengguna
        </Button>
      </div>
      <Suspense fallback={<UserDetailSkeleton />}>
        {params.then(({ id }) => (
          <UserDetailContent id={id} />
        ))}
      </Suspense>
    </>
  );
}

async function UserDetailContent({ id }: { id: string }) {
  const actor = await requirePermission("user:manage");
  const user = await getUserDetail(id);
  if (!user) notFound();

  const isSelf = user.id === actor.id;

  return (
    <>
      <PageHeader
        title={user.fullName}
        description={user.email}
        action={<StatusBadge user={user} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Data pengguna</CardTitle>
          <CardDescription>Nama, kontak, rekening bank, dan role.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-xl">
          <UserEditForm user={user} isSelf={isSelf} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Akun</CardTitle>
          <CardDescription>Password dan status akses pengguna.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserAccountActions user={user} isSelf={isSelf} />
        </CardContent>
      </Card>
    </>
  );
}

function UserDetailSkeleton() {
  return (
    <>
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-96 w-full" />
    </>
  );
}
