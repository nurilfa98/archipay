// Halaman /users (khusus OWNER): daftar pengguna dengan pencarian & filter
// Role/Status (pola sama dengan riwayat Uang Muka, components/data-table).
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

import { PlusIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UsersTable } from "@/features/users/components/users-table";
import { getSeatUsage } from "@/features/subscriptions/seats";
import { canManageUsers } from "@/features/users/access";
import { listUsers } from "@/features/users/queries";
import { parseUserFilters } from "@/features/users/schemas";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

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
  const actor = await verifySession();
  if (!canManageUsers(actor)) redirect("/");

  // Filter: ?role=&status= (nilai tidak valid diabaikan).
  const filters = parseUserFilters(await searchParams);
  const [users, seats] = await Promise.all([listUsers(actor.company.id, filters), getSeatUsage(actor.company.id)]);
  const full = seats.active >= seats.limit;

  return (
    <div className="flex flex-col gap-4">
      {/* Batas pengguna aktif paket langganan (BUSINESS-FLOW §17.1). */}
      <Alert
        className={full ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40" : undefined}
      >
        <UsersIcon />
        <AlertDescription>
          <span>
            Pengguna aktif <strong className="tabular-nums">{seats.active}</strong> dari batas paket{" "}
            <strong className="tabular-nums">{seats.limit}</strong>.
            {full &&
              (can(actor, "subscription:view") ? (
                <>
                  {" "}
                  Nonaktifkan pengguna lain atau{" "}
                  <Link href="/subscription" className="font-medium underline underline-offset-2">
                    tambah kuota di menu Langganan
                  </Link>
                  .
                </>
              ) : (
                " Batas sudah penuh."
              ))}
          </span>
        </AlertDescription>
      </Alert>
      <UsersTable users={users} filters={filters} />
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
