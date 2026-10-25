// Form tambah satu nota (karyawan). Dibuka lewat tombol "Tambah nota" dan
// tertutup lagi setelah nota tersimpan.
//
// - Foto dikompres di HP lebih dulu (compress-image.ts), baru dikirim ke
//   Server Action bersama isian lainnya dalam satu FormData.
// - <input type="file" accept="image/*,application/pdf">: di HP, browser
//   menawarkan pilihan Kamera atau Galeri/File.
// - "Tanpa nota" untuk biaya kecil seperti parkir/ojek: foto tidak diminta,
//   alasan wajib, nominal dibatasi pengaturan perusahaan (dicek server).
//
// Isian tetap ada bila server menolak (onSubmit + startTransition, sama
// seperti form uang muka).

"use client";

import { CircleAlertIcon, FileTextIcon, LoaderCircleIcon, PlusIcon } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addSettlementItem } from "@/features/settlements/actions";
import { compressImage } from "@/features/settlements/compress-image";
import { MAX_RECEIPT_BYTES } from "@/features/settlements/constants";
import type { ExpenseCategory } from "@/features/settlements/queries";
import { formatRupiah } from "@/lib/format";
import type { ActionResult } from "@/types/action-result";

type Props = {
  settlementId: string;
  categories: ExpenseCategory[];
  minDate: string; // "2026-10-24", tanggal dana dicairkan
  noReceiptMaxAmount: number;
};

export function SettlementItemForm(props: Props) {
  const [open, setOpen] = useState(false);
  // Mengganti `key` membuat form kosong lagi setelah nota tersimpan.
  const [formKey, setFormKey] = useState(0);

  if (!open) {
    return (
      <div>
        <Button variant="brand" onClick={() => setOpen(true)}>
          <PlusIcon />
          Tambah nota
        </Button>
      </div>
    );
  }

  return (
    <ItemForm
      key={formKey}
      {...props}
      onSaved={() => {
        setFormKey((key) => key + 1);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  );
}

function ItemForm({
  settlementId,
  categories,
  minDate,
  noReceiptMaxAmount,
  onSaved,
  onCancel,
}: Props & { onSaved: () => void; onCancel: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [noReceipt, setNoReceipt] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);

  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];
  const categoryItems = categories.map((category) => ({ value: category.id, label: category.name }));

  async function handleFileChange(selected: File | undefined) {
    setFile(null);
    if (!selected) return;
    setPreparing(true);
    const compressed = await compressImage(selected);
    setPreparing(false);
    if (compressed.size > MAX_RECEIPT_BYTES) {
      setError({ success: false, message: "Periksa kembali isian Anda.", fieldErrors: { file: ["Ukuran file maksimal 4 MB"] } });
      return;
    }
    setError(null);
    setFile(compressed);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // Nilai dari komponen terkontrol dimasukkan manual agar pasti terkirim.
    formData.set("categoryId", categoryId);
    formData.set("amount", amountDigits);
    formData.delete("noReceipt");
    formData.delete("file");
    if (noReceipt) formData.set("noReceipt", "on");
    else if (file) formData.set("file", file);

    startTransition(async () => {
      const result = await addSettlementItem(settlementId, formData);
      if (result.success) onSaved();
      else setError(result);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4">
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!fieldError("receiptDate")}>
            <FieldLabel htmlFor="receiptDate">Tanggal nota</FieldLabel>
            <Input
              id="receiptDate"
              name="receiptDate"
              type="date"
              min={minDate}
              aria-invalid={!!fieldError("receiptDate")}
              required
            />
            <FieldError>{fieldError("receiptDate")}</FieldError>
          </Field>

          <Field data-invalid={!!fieldError("categoryId")}>
            <FieldLabel htmlFor="categoryId">Kategori</FieldLabel>
            <Select value={categoryId} onValueChange={(value) => setCategoryId(String(value ?? ""))} items={categoryItems}>
              <SelectTrigger id="categoryId" className="w-full" aria-invalid={!!fieldError("categoryId")}>
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {categoryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{fieldError("categoryId")}</FieldError>
          </Field>
        </div>

        <Field data-invalid={!!fieldError("description")}>
          <FieldLabel htmlFor="description">Keterangan</FieldLabel>
          <Input
            id="description"
            name="description"
            maxLength={200}
            autoComplete="off"
            placeholder="Contoh: Bensin ke lokasi proyek Cibubur"
            aria-invalid={!!fieldError("description")}
            required
          />
          <FieldError>{fieldError("description")}</FieldError>
        </Field>

        <Field data-invalid={!!fieldError("amount")}>
          <FieldLabel htmlFor="amount">Nominal</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
              Rp
            </span>
            <Input
              id="amount"
              inputMode="numeric"
              autoComplete="off"
              placeholder="50.000"
              className="pl-9 tabular-nums"
              value={amountDigits ? Number(amountDigits).toLocaleString("id-ID") : ""}
              onChange={(event) => setAmountDigits(event.target.value.replace(/\D/g, "").slice(0, 13))}
              aria-invalid={!!fieldError("amount")}
              required
            />
          </div>
          <FieldError>{fieldError("amount")}</FieldError>
        </Field>

        <Field orientation="horizontal">
          <Checkbox id="noReceipt" checked={noReceipt} onCheckedChange={setNoReceipt} />
          <FieldLabel htmlFor="noReceipt" className="font-normal">
            Tanpa nota (parkir, ojek, dll), maksimal {formatRupiah(noReceiptMaxAmount)}
          </FieldLabel>
        </Field>

        {noReceipt ? (
          <Field data-invalid={!!fieldError("noReceiptReason")}>
            <FieldLabel htmlFor="noReceiptReason">Kenapa tidak ada nota?</FieldLabel>
            <Textarea
              id="noReceiptReason"
              name="noReceiptReason"
              maxLength={200}
              placeholder="Contoh: Parkir liar di lokasi proyek, tidak diberi karcis"
              aria-invalid={!!fieldError("noReceiptReason")}
              required
            />
            <FieldError>{fieldError("noReceiptReason")}</FieldError>
          </Field>
        ) : (
          <Field data-invalid={!!fieldError("file")}>
            <FieldLabel htmlFor="file">Foto atau PDF nota</FieldLabel>
            <Input
              id="file"
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => handleFileChange(event.target.files?.[0])}
              aria-invalid={!!fieldError("file")}
              required
            />
            <FieldDescription>
              {preparing ? (
                <span className="inline-flex items-center gap-1.5">
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                  Menyiapkan foto...
                </span>
              ) : file ? (
                <span className="inline-flex items-center gap-1.5">
                  <FileTextIcon className="size-3.5" />
                  {file.name} · {formatFileSize(file.size)}
                </span>
              ) : (
                "Pastikan tanggal, nama toko, dan total di nota terbaca jelas."
              )}
            </FieldDescription>
            <FieldError>{fieldError("file")}</FieldError>
          </Field>
        )}

        {error && !error.fieldErrors && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{error.message}</AlertTitle>
          </Alert>
        )}

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending || preparing}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : "Simpan nota"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Batal
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
