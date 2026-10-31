// Pita di bawah header untuk Superadmin yang sedang membuka sebuah company:
// mengingatkan data company mana yang sedang dilihat (hanya lihat, tanpa
// transaksi uang), dengan tombol "Ganti" (ke menu Company) dan "Keluar"
// (lepas company aktif). Pengguna biasa tidak melihat pita ini.
//
// Server Component: tombol memakai <form action> ke Server Action.

import { Building2Icon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { leaveCompany } from "@/features/companies/actions";
import type { CurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export function ActiveCompanyBar({ user }: { user: CurrentUser }) {
  if (!user.company || !can(user, "company:manage")) return null;

  return (
    <div className="border-b bg-brand/5">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-1.5 text-sm">
        <Building2Icon className="size-4 shrink-0 text-brand" />
        <span className="min-w-0 truncate">
          <span className="text-muted-foreground">Melihat company </span>
          <span className="font-medium">{user.company.name}</span>
          {!user.company.isActive ? (
            <span className="text-muted-foreground"> (nonaktif)</span>
          ) : user.company.access.locked ? (
            <span className="text-rose-700 dark:text-rose-300"> (terkunci, langganan habis)</span>
          ) : null}
        </span>
        <div className="ml-auto flex shrink-0 items-center">
          <Button variant="ghost" size="sm" className="h-7 px-2" nativeButton={false} render={<Link href="/companies" />}>
            Ganti
          </Button>
          <form action={leaveCompany}>
            <Button type="submit" variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
              Keluar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
