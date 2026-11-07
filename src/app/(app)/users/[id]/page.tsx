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

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  assignableRolesFor,
  canEditBankAccount,
  canEditEmail,
  canManageUser,
  canManageUsers,
} from "@/features/users/access";
import { UserAccountActions } from "@/features/users/components/user-account-actions";
import { UserEditForm } from "@/features/users/components/user-edit-form";
import { StatusBadge } from "@/features/users/components/user-badges";
import { getRecentEmailChange, getUserDetail } from "@/features/users/queries";
import { verifySession } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { CopyButton } from "@/components/copy-button";
import { formatAccountNumber } from "@/lib/bank";
import { formatDateTime } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Detail Pengguna",
};

export default function UserDetailPage({ params }: PageProps<"/users/[id]">) {
  return (
    <>
      <Suspense fallback={<UserDetailSkeleton />}>
        {params.then(({ id }) => (
          <UserDetailContent id={id} />
        ))}
      </Suspense>
    </>
  );
}

async function UserDetailContent({ id }: { id: string }) {
  const actor = await verifySession();
  if (!canManageUsers(actor)) redirect("/");
  const user = await getUserDetail(actor.company.id, id);
  if (!user || user.roles.includes("SUPERADMIN")) notFound();
  const recentEmailChange = await getRecentEmailChange(actor.company.id, user.id);

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
                : user.roles.includes("OWNER")
                  ? "Akun Owner hanya bisa diubah oleh superadmin."
                  : "Akun dengan role Finance, Admin HR, atau Owner hanya bisa diubah oleh Owner."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid max-w-xl gap-x-6 gap-y-4 sm:grid-cols-2">
              <Item label="Nomor WhatsApp">{user.phoneNumber ? formatPhone(user.phoneNumber) : "-"}</Item>
              <Item label="Role">{user.roles.map((role) => ROLE_LABELS[role]).join(", ")}</Item>
              <Item label="Nama bank">{user.bankName ?? "-"}</Item>
              <Item label="Nomor rekening">
                {user.bankAccountNumber ? (
                  <span className="inline-flex items-center gap-1">
                    {formatAccountNumber(user.bankName, user.bankAccountNumber)}
                    <CopyButton
                      value={user.bankAccountNumber}
                      label={`Salin nomor rekening ${user.fullName}`}
                      successMessage="Nomor rekening disalin."
                    />
                  </span>
                ) : (
                  "-"
                )}
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
          <UserEditForm
            user={user}
            roles={assignableRolesFor(actor)}
            canEditBank={canEditBankAccount(actor)}
            canEditEmail={canEditEmail(actor)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Akun</CardTitle>
          <CardDescription>Password dan status akses pengguna.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserAccountActions
            user={user}
            recentEmailChange={
              recentEmailChange
                ? {
                    whenLabel: formatDateTime(recentEmailChange.at),
                    byName: recentEmailChange.byName,
                    oldEmail: recentEmailChange.oldEmail,
                  }
                : null
            }
          />
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
