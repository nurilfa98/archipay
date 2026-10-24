// Halaman /users (khusus OWNER): daftar pengguna + pencarian.
//
// Polanya sama dengan halaman lain: judul statis di luar <Suspense> (langsung
// tampil saat menu diklik), sedangkan bagian yang membaca cookie, searchParams,
// dan database ada di dalamnya.
//
// searchParams adalah Promise. Promise-nya diteruskan ke komponen di dalam
// <Suspense> dan baru di-await di sana, agar kerangka halaman tetap statis.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md (searchParams)
// - node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md

import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserSearch } from "@/features/users/components/user-search";
import { UsersTable } from "@/features/users/components/users-table";
import { listUsers } from "@/features/users/queries";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Pengguna",
};

export default function UsersPage({ searchParams }: PageProps<"/users">) {
  return (
    <>
      <PageHeader
        title="Pengguna"
        description="Kelola akun, role, dan status aktif pengguna."
        action={
          <Button nativeButton={false} render={<Link href="/users/new" />}>
            <PlusIcon />
            Tambah pengguna
          </Button>
        }
      />
      <Suspense fallback={<UsersSkeleton />}>
        <UsersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function UsersContent({ searchParams }: Pick<PageProps<"/users">, "searchParams">) {
  await requirePermission("user:manage");

  const { q } = await searchParams;
  // ?q=a&q=b menghasilkan array; cukup ambil yang pertama.
  const search = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 100) || undefined;
  const users = await listUsers(search);

  return (
    <div className="flex flex-col gap-4">
      <UserSearch search={search} />
      <UsersTable users={users} search={search} />
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-full max-w-sm" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
