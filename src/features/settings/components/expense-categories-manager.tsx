// Kelola kategori biaya (OWNER): tambah, ganti nama, aktif/nonaktif.
// Kategori tidak bisa dihapus agar nota lama tetap utuh; kategori nonaktif
// tidak muncul lagi di form nota.

"use client";

import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { ToneBadge } from "@/components/tone-badge";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import {
  createExpenseCategory,
  renameExpenseCategory,
  setExpenseCategoryActive,
} from "@/features/settings/actions";
import type { ExpenseCategoryWithUsage } from "@/features/settings/queries";

const nameOf = (formData: FormData) => String(formData.get("name") ?? "");

export function ExpenseCategoriesManager({ categories }: { categories: ExpenseCategoryWithUsage[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <ActionDialog
          label="Tambah kategori"
          title="Tambah kategori biaya"
          description="Kategori baru langsung bisa dipilih karyawan saat mengisi nota."
          confirmLabel="Simpan"
          successMessage="Kategori ditambahkan."
          onConfirm={(formData) => createExpenseCategory(nameOf(formData))}
        >
          {(fieldError) => <NameField error={fieldError("name")} />}
        </ActionDialog>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead className="text-right">Dipakai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28 text-center">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {category.usageCount} nota
                </TableCell>
                <TableCell>
                  {category.isActive ? (
                    <ToneBadge tone="success">Aktif</ToneBadge>
                  ) : (
                    <ToneBadge tone="pending">Nonaktif</ToneBadge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <ActionDialog
                      label="Ganti nama"
                      icon={<PencilIcon className="size-[18px]" />}
                      variant="edit"
                      title="Ganti nama kategori"
                      description={`Nama baru juga tampil di nota lama yang memakai kategori "${category.name}".`}
                      confirmLabel="Simpan"
                      successMessage="Nama kategori diperbarui."
                      onConfirm={(formData) => renameExpenseCategory(category.id, nameOf(formData))}
                    >
                      {(fieldError) => <NameField defaultValue={category.name} error={fieldError("name")} />}
                    </ActionDialog>
                    <ActionDialog
                      label={category.isActive ? "Nonaktifkan" : "Aktifkan"}
                      // Ikon & warna mengikuti status saat ini: ceklis hijau = Aktif,
                      // X merah = Nonaktif.
                      icon={
                        category.isActive ? (
                          <CheckIcon className="size-[18px]" />
                        ) : (
                          <XIcon className="size-[18px]" />
                        )
                      }
                      variant={category.isActive ? "success" : "destructive"}
                      title={category.isActive ? `Nonaktifkan "${category.name}"?` : `Aktifkan "${category.name}"?`}
                      description={
                        category.isActive
                          ? "Kategori tidak bisa dipilih lagi untuk nota baru. Nota lama tetap memakai kategori ini."
                          : "Kategori bisa dipilih lagi saat mengisi nota."
                      }
                      confirmLabel={category.isActive ? "Nonaktifkan" : "Aktifkan"}
                      successMessage={category.isActive ? "Kategori dinonaktifkan." : "Kategori diaktifkan."}
                      onConfirm={() => setExpenseCategoryActive(category.id, !category.isActive)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NameField({ defaultValue, error }: { defaultValue?: string; error?: string }) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="name">Nama kategori</FieldLabel>
      <Input
        id="name"
        name="name"
        defaultValue={defaultValue}
        maxLength={50}
        autoComplete="off"
        placeholder="Contoh: Akomodasi"
        aria-invalid={!!error}
        required
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

