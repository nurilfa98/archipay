// Halaman /users/[id]: detail, edit, reset password, dan aktif/nonaktif.
//
// Akun yang tidak boleh dikelola pengunjung (akun Owner bila pengunjungnya
// Owner, termasuk akunnya sendiri) tampil baca saja. Akun superadmin 404.
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
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { assignableRolesFor, canManageUser } from "@/features/users/access";
import { UserAccountActions } from "@/features/users/components/user-account-actions";
import { UserEditForm } from "@/features/users/components/user-edit-form";
import { StatusBadge } from "@/features/users/components/users-table";
import { getUserDetail } from "@/features/users/queries";
import { requirePermission } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { formatAccountNumber } from "@/lib/bank";
import { formatPhone } from "@/lib/phone";

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
  const user = await getUserDetail(actor.company.id, id);
  if (!user || user.roles.includes("SUPERADMIN")) notFound();

  const header = <PageHeader title={user.fullName} description={user.email} action={<StatusBadge user={user} />} />;

  if (!canManageUser(actor, user)) {
    return (
      <>
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Data pengguna</CardTitle>
            <CardDescription>
              {user.id === actor.id
                ? "Ubah data Anda sendiri lewat menu Profil."
                : "Akun Owner hanya bisa diubah oleh superadmin."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid max-w-xl gap-x-6 gap-y-4 sm:grid-cols-2">
              <Item label="Nomor WhatsApp">{user.phoneNumber ? formatPhone(user.phoneNumber) : "-"}</Item>
              <Item label="Role">{user.roles.map((role) => ROLE_LABELS[role]).join(", ")}</Item>
              <Item label="Nama bank">{user.bankName ?? "-"}</Item>
              <Item label="Nomor rekening">
                {user.bankAccountNumber ? formatAccountNumber(user.bankName, user.bankAccountNumber) : "-"}
              </Item>
            </dl>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <Card>
        <CardHeader>
          <CardTitle>Data pengguna</CardTitle>
          <CardDescription>Nama, kontak, rekening bank, dan role.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-xl">
          <UserEditForm user={user} roles={assignableRolesFor(actor)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Akun</CardTitle>
          <CardDescription>Password dan status akses pengguna.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserAccountActions user={user} />
        </CardContent>
      </Card>
    </>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
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
