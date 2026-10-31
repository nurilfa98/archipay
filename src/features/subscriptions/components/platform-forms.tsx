// Form di halaman Pengaturan platform (Superadmin): komponen harga paket
// (dengan kalkulasi otomatis), masa gratis & tenggang + batas pengguna masa
// gratis + WhatsApp admin, rekening bank tujuan transfer, dan QRIS statis.

"use client";

import { ImageUpIcon, LoaderCircleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { notify } from "@/lib/notify";
import { BankAccountFields } from "@/components/bank-account-fields";
import { PhoneInput } from "@/components/phone-input";
import { bankAccentClass, formatAccountNumber } from "@/lib/bank";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addBankAccount, deleteBankAccount, removeQris, updatePlatformSettings, updatePricing, uploadQris } from "../actions";
import { PLAN_LABELS, PLAN_MONTHS } from "../constants";
import { discountOf, MAX_USERS, planPrice, type Pricing } from "../pricing";
import type { BankAccount } from "../queries";
import { RupiahInput } from "./rupiah-input";
import { useFormAction } from "./use-form-action";

// Komponen harga standar. Harga 6 bulan & 1 tahun TIDAK diketik: dihitung
// otomatis dari harga per bulan dan diskonnya (pricing.ts), dengan simulasi
// jumlah pengguna agar Superadmin melihat tagihan yang akan diterima Owner.
export function PricingForm({ pricing }: { pricing: Pricing }) {
  const { pending, handleSubmit, fieldError } = useFormAction(updatePricing, "Harga paket tersimpan.");
  const [values, setValues] = useState(pricing);
  const [sampleUsers, setSampleUsers] = useState(Math.max(pricing.includedUsers * 2, 20));
  const set = (key: keyof Pricing) => (value: number) => setValues((current) => ({ ...current, [key]: value }));

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-3">
          <RupiahInput
            name="basePrice"
            label="Harga dasar per bulan"
            defaultValue={pricing.basePrice}
            description="0 = paket belum dijual."
            onValueChange={set("basePrice")}
            error={fieldError("basePrice")}
          />
          <NumberField
            name="includedUsers"
            label="Sudah termasuk"
            unit="pengguna"
            defaultValue={pricing.includedUsers}
            min={1}
            max={MAX_USERS}
            description="Pengguna aktif yang tercakup harga dasar."
            onValueChange={set("includedUsers")}
            error={fieldError("includedUsers")}
          />
          <RupiahInput
            name="extraUserPrice"
            label="Per pengguna tambahan / bulan"
            defaultValue={pricing.extraUserPrice}
            description="Di atas jumlah yang termasuk. Juga dasar tambah kuota prorata."
            onValueChange={set("extraUserPrice")}
            error={fieldError("extraUserPrice")}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <NumberField
            name="discount6"
            label="Diskon paket 6 bulan"
            unit="%"
            defaultValue={pricing.discount6}
            min={0}
            max={90}
            onValueChange={set("discount6")}
            error={fieldError("discount6")}
          />
          <NumberField
            name="discount12"
            label="Diskon paket 1 tahun"
            unit="%"
            defaultValue={pricing.discount12}
            min={0}
            max={90}
            onValueChange={set("discount12")}
            error={fieldError("discount12")}
          />
        </div>

        <PricingPreview pricing={values} sampleUsers={sampleUsers} onSampleUsersChange={setSampleUsers} />
        <SubmitButton pending={pending} label="Simpan harga" />
      </FieldGroup>
    </form>
  );
}

// Tabel hasil kalkulasi: paket 1/6/12 bulan untuk jumlah pengguna yang
// termasuk harga dasar dan untuk contoh jumlah pengguna lain.
export function PricingPreview({
  pricing,
  sampleUsers,
  onSampleUsersChange,
}: {
  pricing: Pricing;
  sampleUsers: number;
  onSampleUsersChange: (value: number) => void;
}) {
  const columns = [pricing.includedUsers, sampleUsers];
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Hasil kalkulasi otomatis</p>
        <label className="flex items-center gap-2 text-muted-foreground">
          Contoh
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_USERS}
            value={sampleUsers}
            onChange={(event) => onSampleUsersChange(clampUsers(event.target.valueAsNumber))}
            className="h-8 w-20 bg-background tabular-nums"
            aria-label="Contoh jumlah pengguna"
          />
          pengguna
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-md">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Paket</th>
              {columns.map((users, index) => (
                <th key={index} className="py-1 text-right font-normal">
                  {users} pengguna
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {PLAN_MONTHS.map((months) => (
              <tr key={months} className="border-t">
                <td className="py-2">
                  {PLAN_LABELS[months]}
                  {discountOf(pricing, months) > 0 && (
                    <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-300">−{discountOf(pricing, months)}%</span>
                  )}
                </td>
                {columns.map((users, index) => (
                  <td key={index} className="py-2 text-right">
                    <p className="font-medium">{formatRupiah(planPrice(pricing, months, users))}</p>
                    {months > 1 && (
                      <p className="text-xs text-muted-foreground">
                        setara {formatRupiah(Math.round(planPrice(pricing, months, users) / months))}/bln
                      </p>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function clampUsers(value: number) {
  return Number.isFinite(value) ? Math.min(MAX_USERS, Math.max(1, Math.round(value))) : 1;
}

export function PlatformSettingsForm({
  settings,
}: {
  settings: { freeDays: number; graceDays: number; trialMaxUsers: number; adminPhone: string | null };
}) {
  const { pending, handleSubmit, fieldError } = useFormAction(updatePlatformSettings, "Pengaturan platform tersimpan.");
  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <DaysField
            name="freeDays"
            label="Masa gratis company baru"
            defaultValue={settings.freeDays}
            max={90}
            description="Berlaku untuk company yang dibuat setelah ini."
            error={fieldError("freeDays")}
          />
          <DaysField
            name="graceDays"
            label="Masa tenggang"
            defaultValue={settings.graceDays}
            max={30}
            description="Setelah masa aktif habis, sebelum company dikunci."
            error={fieldError("graceDays")}
          />
        </div>
        <NumberField
          name="trialMaxUsers"
          label="Batas pengguna masa gratis"
          unit="pengguna"
          defaultValue={settings.trialMaxUsers}
          min={1}
          max={MAX_USERS}
          description="Pengguna aktif (Owner, Finance, Karyawan) selama masa gratis. Berlaku untuk company yang dibuat setelah ini."
          error={fieldError("trialMaxUsers")}
        />
        <PhoneInput
          name="adminPhone"
          label="WhatsApp admin ArchiPay (opsional)"
          defaultValue={settings.adminPhone}
          description="Menerima kabar setiap ada Owner yang mengirim bukti bayar."
          className="max-w-60 tabular-nums"
          error={fieldError("adminPhone")}
        />
        <SubmitButton pending={pending} label="Simpan pengaturan" />
      </FieldGroup>
    </form>
  );
}

export function BankAccountsManager({ accounts }: { accounts: BankAccount[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  // Nama bank & nomor rekening menyimpan nilainya di state (BankAccountFields),
  // jadi tidak ikut form.reset(). Key baru membuat isian itu dibuat ulang kosong.
  const [fieldsKey, setFieldsKey] = useState(0);
  const { pending, handleSubmit, fieldError } = useFormAction(addBankAccount, "Rekening ditambahkan.", () => {
    formRef.current?.reset();
    setFieldsKey((value) => value + 1);
  });

  return (
    <div className="flex flex-col gap-4">
      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Belum ada rekening. Owner hanya melihat QRIS (bila ada).
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className={cn("min-w-0 border-l-4 pl-3", bankAccentClass(account.bankName))}>
                <p className="font-semibold">{account.bankName}</p>
                <p className="font-mono text-base text-foreground tabular-nums">
                  {formatAccountNumber(account.bankName, account.accountNumber)}
                </p>
                <p className="truncate text-muted-foreground">a.n. {account.accountName}</p>
              </div>
              <ActionDialog
                label="Hapus rekening"
                icon={<Trash2Icon />}
                variant="ghost"
                title="Hapus rekening ini?"
                description={`${account.bankName} ${formatAccountNumber(account.bankName, account.accountNumber)} a.n. ${account.accountName} tidak lagi tampil ke Owner.`}
                confirmLabel="Hapus"
                successMessage="Rekening dihapus."
                onConfirm={() => deleteBankAccount(account.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-3">
            <BankAccountFields
              key={fieldsKey}
              accountField="accountNumber"
              required
              bankNameError={fieldError("bankName")}
              accountError={fieldError("accountNumber")}
            />
            <TextField name="accountName" label="Atas nama" placeholder="PT Realitech Solutions" error={fieldError("accountName")} />
          </div>
          <Field orientation="horizontal">
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? <LoaderCircleIcon className="animate-spin" /> : <PlusIcon />}
              Tambah rekening
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}

export function QrisForm({ hasQris }: { hasQris: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [version, setVersion] = useState(0);
  const [removing, startRemoving] = useTransition();
  const { pending, handleSubmit, fieldError } = useFormAction(uploadQris, "Gambar QRIS tersimpan.", () => {
    formRef.current?.reset();
    setVersion((value) => value + 1);
  });

  function handleRemove() {
    startRemoving(async () => {
      const result = await removeQris();
      if (result.success) notify.success("Gambar QRIS dihapus.");
      else notify.error(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {hasQris ? (
        // eslint-disable-next-line @next/next/no-img-element -- gambar privat lewat route API
        <img
          src={`/api/platform/qris?v=${version}`}
          alt="QRIS pembayaran ArchiPay"
          className="size-48 shrink-0 rounded-lg border bg-white object-contain p-2"
        />
      ) : (
        <div className="flex size-48 shrink-0 items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Belum ada gambar QRIS
        </div>
      )}
      <form ref={formRef} onSubmit={handleSubmit} className="flex-1">
        <FieldGroup>
          <Field data-invalid={!!fieldError("qris")}>
            <FieldLabel htmlFor="qris">{hasQris ? "Ganti gambar QRIS" : "Unggah gambar QRIS"}</FieldLabel>
            <Input id="qris" name="qris" type="file" accept="image/png,image/jpeg,image/webp" required />
            <FieldDescription>QRIS statis dari bank / e-wallet bisnis. PNG, JPG, atau WebP, maks. 2 MB.</FieldDescription>
            <FieldError>{fieldError("qris")}</FieldError>
          </Field>
          <Field orientation="horizontal">
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? <LoaderCircleIcon className="animate-spin" /> : <ImageUpIcon />}
              Simpan gambar
            </Button>
            {hasQris && (
              <Button type="button" variant="ghost" disabled={removing} onClick={handleRemove}>
                {removing ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}
                Hapus QRIS
              </Button>
            )}
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}

export function NumberField({
  name,
  label,
  unit,
  defaultValue,
  min,
  max,
  description,
  onValueChange,
  error,
}: {
  name: string;
  label: string;
  unit: string;
  defaultValue: number;
  min: number;
  max: number;
  description?: string;
  onValueChange?: (value: number) => void;
  error?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          defaultValue={defaultValue}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isFinite(value)) onValueChange?.(value);
          }}
          className="w-24 tabular-nums"
          aria-invalid={!!error}
          required
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function DaysField({
  name,
  label,
  defaultValue,
  max,
  description,
  error,
}: {
  name: string;
  label: string;
  defaultValue: number;
  max: number;
  description: string;
  error?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          defaultValue={defaultValue}
          className="w-24 tabular-nums"
          aria-invalid={!!error}
          required
        />
        <span className="text-sm text-muted-foreground">hari</span>
      </div>
      <FieldDescription>{description}</FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function TextField({
  name,
  label,
  placeholder,
  inputMode,
  error,
}: {
  name: string;
  label: string;
  placeholder: string;
  inputMode?: "numeric";
  error?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} name={name} placeholder={placeholder} inputMode={inputMode} autoComplete="off" aria-invalid={!!error} required />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Field orientation="horizontal">
      <Button type="submit" disabled={pending}>
        {pending && <LoaderCircleIcon className="animate-spin" />}
        {pending ? "Menyimpan..." : label}
      </Button>
    </Field>
  );
}
