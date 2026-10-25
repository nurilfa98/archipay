// Bagian-bagian panel filter untuk <DataTable filters={...}>. Dipakai ulang
// oleh setiap halaman daftar (uang muka, nanti pertanggungjawaban, dst).
//
// Nilai filter disimpan di URL (?year=2026&month=10&status=APPROVED), lalu
// Server Component halaman membaca searchParams dan menyaring query-nya.
// Keuntungannya: filter ikut tersimpan saat halaman di-refresh/di-bookmark,
// dan tombol Back mengembalikan filter sebelumnya.
//
// Contoh pemakaian (lihat features/advances/components/advances-table.tsx):
//
//   const { setFilters, pending } = useUrlFilters();
//   <DataTable
//     pending={pending}
//     activeFilterCount={...}
//     filters={
//       <DataTableFilters onReset={() => setFilters({ status: undefined })}>
//         <DataTableFilterSelect label="Status" value={status} options={...}
//           onValueChange={(value) => setFilters({ status: value })} />
//       </DataTableFilters>
//     }
//   />
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md

"use client";

import { LoaderCircleIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Nilai pilihan "Semua ..." di dropdown. Tidak ditulis ke URL.
export const FILTER_ALL = "ALL";

// Mengganti sebagian query string halaman ini. undefined = hapus dari URL.
// `pending` true selama server menyiapkan data dengan filter baru.
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setFilters(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === FILTER_ALL) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return { setFilters, pending };
}

// Wadah isi panel: field filter dalam grid + tombol hapus filter.
export function DataTableFilters({
  children,
  onReset,
  canReset,
  pending,
}: {
  children: ReactNode;
  onReset: () => void;
  canReset: boolean; // false bila belum ada filter aktif
  pending?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="flex items-center justify-end gap-3">
        {pending && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3.5 animate-spin" />
            Memuat data...
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={onReset} disabled={!canReset}>
          <XIcon />
          Hapus filter
        </Button>
      </div>
    </div>
  );
}

export type FilterOption = { value: string; label: string };

// Dropdown filter berlabel. Pilihan pertama sebaiknya "Semua ..." dengan
// value FILTER_ALL.
export function DataTableFilterSelect({
  label,
  value,
  options,
  onValueChange,
  disabled,
  description,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  description?: string;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => next && onValueChange(String(next))}
        items={options}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <FieldDescription className="text-xs">{description}</FieldDescription>}
    </Field>
  );
}
