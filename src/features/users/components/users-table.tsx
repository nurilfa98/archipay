// Tabel daftar pengguna. Server Component: hanya menampilkan data, tidak ada
// interaksi selain link, jadi tidak perlu JavaScript tambahan di browser.
//
// Responsif: layar lebar memakai tabel (di tablet kolom WhatsApp
// disembunyikan); HP (< md) memakai kartu seperti AdvanceCard di
// advances-table.tsx, supaya tidak perlu geser ke samping.
//
// Referensi: https://ui.shadcn.com/docs/components/table

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { ToneBadge } from "@/components/tone-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserListItem } from "@/features/users/queries";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

export function UsersTable({ users, search }: { users: UserListItem[]; search?: string }) {
  if (users.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {search ? `Tidak ada pengguna yang cocok dengan "${search}".` : "Belum ada pengguna."}
      </p>
    );
  }

  const table = (
    <div className="hidden rounded-lg border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama</TableHead>
            <TableHead className="hidden md:table-cell">WhatsApp</TableHead>
            <TableHead className="hidden sm:table-cell">Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Detail</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            // `relative` + link `after:absolute after:inset-0` membuat seluruh
            // baris bisa diklik, tanpa membungkus <tr> dengan <a> (HTML tidak valid).
            <TableRow key={user.id} className="relative">
              <TableCell className="max-w-48 sm:max-w-none">
                <Link
                  href={`/users/${user.id}`}
                  className="font-medium after:absolute after:inset-0 hover:underline"
                >
                  {user.fullName}
                </Link>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <RoleBadges roles={user.roles} className="mt-1 sm:hidden" />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {user.phoneNumber ? formatPhone(user.phoneNumber) : "-"}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <RoleBadges roles={user.roles} />
              </TableCell>
              <TableCell>
                <StatusBadge user={user} />
              </TableCell>
              <TableCell>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      {table}
      <ul className="flex flex-col gap-2 md:hidden">
        {users.map((user) => (
          // Seluruh kartu bisa diklik (link dibentangkan lewat ::after).
          <li
            key={user.id}
            className="relative flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <Link
                  href={`/users/${user.id}`}
                  className="truncate font-medium after:absolute after:inset-0 hover:underline"
                >
                  {user.fullName}
                </Link>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <StatusBadge user={user} />
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {user.phoneNumber ? formatPhone(user.phoneNumber) : "WhatsApp belum diisi"}
              </span>
              <RoleBadges roles={user.roles} className="justify-end" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function RoleBadges({ roles, className }: { roles: UserListItem["roles"]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {roles.map((role) => (
        <Badge key={role} variant="secondary">
          {ROLE_LABELS[role]}
        </Badge>
      ))}
    </div>
  );
}

// Aktif = hijau (teks hijau tua), Nonaktif = abu-abu (teks hitam).
export function StatusBadge({ user }: { user: Pick<UserListItem, "isActive" | "mustChangePassword"> }) {
  if (!user.isActive) {
    return (
      <ToneBadge tone="pending" className="text-slate-900 dark:text-slate-100">
        Nonaktif
      </ToneBadge>
    );
  }
  // Belum pernah login / belum mengganti password sementara.
  if (user.mustChangePassword) return <Badge variant="outline">Menunggu login</Badge>;
  return <ToneBadge tone="success">Aktif</ToneBadge>;
}
