// Kelola kategori biaya (OWNER): tambah, ganti nama (ikon pensil), dan
// aktif/nonaktif lewat saklar (category-active-switch.tsx). Tampilan & cara
// kerjanya sama dengan daftar Jenis cuti & izin
// (features/attendance/components/leave-settings.tsx): nama + jumlah pemakaian
// di kiri, saklar & tombol ubah di kanan, dan form tambah/ubah langsung di
// dalam daftar (tanpa pop up). Muat di HP tanpa geser ke samping.
// Kategori tidak bisa dihapus agar nota lama tetap utuh; kategori nonaktif
// tidak muncul lagi di form nota.
// - readOnly (superadmin): tanpa tombol tambah & ubah, saklar status hanya tampilan.

"use client";

import { LoaderCircleIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createExpenseCategory, renameExpenseCategory } from "@/features/settings/actions";
import type { ExpenseCategoryWithUsage } from "@/features/settings/queries";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";
import { CategoryActiveSwitch } from "./category-active-switch";

export function ExpenseCategoriesManager({
  categories,
  readOnly = false,
}: {
  categories: ExpenseCategoryWithUsage[];
  readOnly?: boolean;
}) {
  // id kategori yang sedang diubah, "new" untuk tambah, null bila tidak ada.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-lg border">
        {categories.map((category) =>
          editing === category.id ? (
            <li key={category.id} className="p-3">
              <CategoryForm category={category} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={category.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{category.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">Dipakai {category.usageCount} nota</p>
              </div>
              <div className="flex items-center gap-2">
                <CategoryActiveSwitch
                  id={category.id}
                  name={category.name}
                  isActive={category.isActive}
                  readOnly={readOnly}
                />
                {!readOnly && (
                  <Button
                    variant="edit"
                    size="icon-sm"
                    aria-label={`Ganti nama ${category.name}`}
                    title="Ganti nama"
                    onClick={() => setEditing(category.id)}
                  >
                    <PencilIcon />
                  </Button>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
      {!readOnly &&
        (editing === "new" ? (
          <div className="rounded-lg border p-3">
            <CategoryForm onDone={() => setEditing(null)} />
          </div>
        ) : (
          <Button variant="brand" className="self-start" onClick={() => setEditing("new")}>
            <PlusIcon />
            Tambah kategori
          </Button>
        ))}
    </div>
  );
}

// Form tambah (tanpa `category`) atau ganti nama, langsung di dalam daftar.
function CategoryForm({ category, onDone }: { category?: ExpenseCategoryWithUsage; onDone: () => void }) {
  const [pending, startSaving] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const nameError = error?.fieldErrors?.name?.[0];
  const inputId = category ? `category-name-${category.id}` : "category-name-new";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    startSaving(async () => {
      const result = category ? await renameExpenseCategory(category.id, name) : await createExpenseCategory(name);
      if (!result.success) {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      notify.success(category ? "Nama kategori diperbarui." : "Kategori ditambahkan.");
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup className="gap-4">
        <Field data-invalid={!!nameError} className="max-w-sm">
          <FieldLabel htmlFor={inputId}>Nama kategori</FieldLabel>
          <Input
            id={inputId}
            name="name"
            defaultValue={category?.name}
            maxLength={50}
            autoComplete="off"
            placeholder="Contoh: Akomodasi"
            aria-invalid={!!nameError}
            autoFocus
            required
          />
          <FieldDescription>
            {category
              ? `Nama baru juga tampil di nota lama yang memakai kategori "${category.name}".`
              : "Kategori baru langsung bisa dipilih karyawan saat mengisi nota."}
          </FieldDescription>
          <FieldError>{nameError}</FieldError>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            Simpan
          </Button>
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Batal
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
