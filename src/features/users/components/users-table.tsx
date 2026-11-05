// Data table daftar pengguna (Client Component, memakai components/data-table),
// polanya sama dengan riwayat uang muka (features/advances/components/advances-table.tsx):
//
// - Filter Role & Status ada di panel "Filter" dan diterapkan server lewat URL
//   (/users?role=FINANCE&status=ACTIVE); pencarian nama/email berjalan di
//   browser atas data yang sudah dimuat.
// - Seluruh baris bisa diklik lewat link di kolom Nama.
// - Layar lebar: tabel (kolom WhatsApp & Role disembunyikan di layar sempit).
//   HP (< md): kartu, 10 dulu lalu +10 saat di-scroll.

"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { createDataTableColumns, DataTable } from "@/components/data-table/data-table";
import {
  DataTableFilters,
  DataTableFilterSelect,
  FILTER_ALL,
  useUrlFilters,
  type FilterOption,
} from "@/components/data-table/data-table-filters";
import { USER_STATUS, USER_STATUS_LABELS } from "@/features/users/constants";
import type { UserListItem } from "@/features/users/queries";
import type { UserFilters } from "@/features/users/schemas";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/auth/roles";
import { formatPhone } from "@/lib/phone";
import { RoleBadges, StatusBadge } from "./user-badges";

const column = createDataTableColumns<UserListItem>();

const nameColumn = column.accessor("fullName", {
  header: "Nama",
  sortFn: "text",
  cell: ({ row }) => (
    <div className="max-w-48 sm:max-w-none">
      <Link href={`/users/${row.original.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
        {row.original.fullName}
      </Link>
      <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
      <RoleBadges roles={row.original.roles} className="mt-1 sm:hidden" />
    </div>
  ),
});

// Hanya untuk pencarian (nama ATAU email); tampilannya sudah di kolom Nama.
const emailColumn = column.accessor("email", {
  header: "Email",
  enableSorting: false,
  meta: { className: "hidden" },
});

const phoneColumn = column.accessor("phoneNumber", {
  header: "WhatsApp",
  enableSorting: false,
  meta: { className: "hidden whitespace-nowrap md:table-cell" },
  cell: ({ getValue }) => {
    const phone = getValue();
    return phone ? formatPhone(phone) : "-";
  },
});

const roleColumn = column.accessor("roles", {
  header: "Role",
  enableSorting: false,
  meta: { className: "hidden sm:table-cell" },
  cell: ({ getValue }) => <RoleBadges roles={getValue()} />,
});

const statusColumn = column.display({
  id: "status",
  header: "Status",
  meta: { className: "whitespace-nowrap" },
  cell: ({ row }) => <StatusBadge user={row.original} />,
});

const openColumn = column.display({
  id: "open",
  header: () => <span className="sr-only">Detail</span>,
  meta: { className: "w-10" },
  cell: () => <ChevronRightIcon className="size-4 text-muted-foreground" />,
});

// Dibuat sekali di luar komponen (wajib stabil untuk TanStack Table v9).
const COLUMNS = column.columns([nameColumn, emailColumn, phoneColumn, roleColumn, statusColumn, openColumn]);
const SEARCHABLE = ["fullName", "email"] as const;

const ROLE_OPTIONS: FilterOption[] = [
  { value: FILTER_ALL, label: "Semua role" },
  ...ASSIGNABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] })),
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: FILTER_ALL, label: "Semua status" },
  ...USER_STATUS.map((value) => ({ value, label: USER_STATUS_LABELS[value] })),
];

export function UsersTable({ users, filters }: { users: UserListItem[]; filters: UserFilters }) {
  const { setFilters, pending } = useUrlFilters();
  const activeFilterCount = [filters.role, filters.status].filter(Boolean).length;

  return (
    <DataTable
      columns={COLUMNS}
      data={users}
      searchableColumns={SEARCHABLE}
      searchPlaceholder="Cari nama atau email"
      emptyMessage={activeFilterCount > 0 ? "Tidak ada pengguna pada filter ini." : "Belum ada pengguna."}
      activeFilterCount={activeFilterCount}
      pending={pending}
      renderCard={(user) => <UserCard user={user} />}
      filters={
        <DataTableFilters
          canReset={activeFilterCount > 0}
          pending={pending}
          onReset={() => setFilters({ role: undefined, status: undefined })}
        >
          <DataTableFilterSelect
            label="Role"
            value={filters.role ?? FILTER_ALL}
            options={ROLE_OPTIONS}
            onValueChange={(role) => setFilters({ role })}
          />
          <DataTableFilterSelect
            label="Status"
            value={filters.status ?? FILTER_ALL}
            options={STATUS_OPTIONS}
            onValueChange={(status) => setFilters({ status })}
          />
        </DataTableFilters>
      }
    />
  );
}

// Kartu satu pengguna untuk HP. Seluruh kartu bisa diklik (link dibentangkan
// lewat ::after). Isinya sama dengan kolom tabel.
function UserCard({ user }: { user: UserListItem }) {
  return (
    <div className="relative flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50">
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
    </div>
  );
}
