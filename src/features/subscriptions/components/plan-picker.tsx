// Menu Langganan (Owner): pilih jumlah pengguna + paket (harga dihitung
// otomatis, pricing.ts) atau tambah kuota pengguna → panel pembayaran
// (rekening & QRIS) → form "Saya sudah bayar" + bukti. Memilih paket TIDAK menyimpan apa pun;
// tagihan baru tercatat saat bukti dikirim (BUSINESS-FLOW §17).
//
// Client Component: data paket, rekening, dan teks tanggal sudah disiapkan
// server (app/(app)/subscription/page.tsx).

"use client";

import { ArrowLeftIcon, CheckIcon, LoaderCircleIcon, MinusIcon, PlusIcon, SendIcon, UsersIcon } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { compressImage } from "@/features/settlements/compress-image";
import { bankAccentClass, formatAccountNumber } from "@/lib/bank";
import { formatRupiah } from "@/lib/format";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types/action-result";
import { claimSubscriptionPaid } from "../actions";
import { PLAN_LABELS, PLAN_MONTHS, PROOF_MAX_BYTES, type PlanMonths } from "../constants";
import { discountOf, MAX_USERS, planPrice, topupPrice, type Pricing } from "../pricing";
import type { BankAccount } from "../queries";

type PaymentInfo = { banks: BankAccount[]; hasQris: boolean };

export function PlanPicker({
  pricing,
  minUsers,
  defaultUsers,
  payment,
}: {
  pricing: Pricing;
  minUsers: number; // termasuk harga dasar / pengguna aktif saat ini
  defaultUsers: number;
  payment: PaymentInfo;
}) {
  const [selected, setSelected] = useState<PlanMonths | null>(null);
  const [userCount, setUserCount] = useState(Math.max(defaultUsers, minUsers));

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            <ArrowLeftIcon />
            Ganti paket
          </Button>
        </div>
        <PaymentPanel
          title={`Paket ${PLAN_LABELS[selected]} · ${userCount} pengguna`}
          amount={planPrice(pricing, selected, userCount)}
          payment={payment}
          hidden={{ kind: "PLAN", months: String(selected), users: String(userCount) }}
          onDone={() => setSelected(null)}
        />
      </div>
    );
  }

  if (pricing.basePrice <= 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Harga paket belum diatur. Hubungi admin ArchiPay.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <UserCountField
        id="plan-users"
        label="Jumlah pengguna aktif yang dibutuhkan"
        value={userCount}
        min={minUsers}
        onChange={setUserCount}
        description={`Owner, Finance, dan Karyawan yang aktif. Minimal ${minUsers}. Harga dasar sudah termasuk ${pricing.includedUsers} pengguna, tambahan ${formatRupiah(pricing.extraUserPrice)}/pengguna/bulan.`}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_MONTHS.map((months) => {
          const total = planPrice(pricing, months, userCount);
          const discount = discountOf(pricing, months);
          return (
            <button
              key={months}
              type="button"
              onClick={() => setSelected(months)}
              className={cn(
                "flex flex-col gap-3 rounded-xl border bg-card p-5 text-left outline-none transition-colors hover:border-brand hover:bg-brand/5 focus-visible:ring-2 focus-visible:ring-brand",
                months === 12 && "border-brand/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{PLAN_LABELS[months]}</span>
                {discount > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    Hemat {discount}%
                  </span>
                )}
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{formatRupiah(total)}</p>
                {months > 1 && (
                  <p className="text-xs text-muted-foreground">setara {formatRupiah(Math.round(total / months))}/bulan</p>
                )}
              </div>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <UsersIcon className="size-3.5" />
                  Maksimal {userCount} pengguna aktif
                </li>
                <li>
                  Termasuk {pricing.includedUsers} pengguna
                  {userCount > pricing.includedUsers &&
                    ` + ${userCount - pricing.includedUsers} × ${formatRupiah(pricing.extraUserPrice)}/bulan`}
                </li>
              </ul>
              <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                <CheckIcon className="size-4" />
                Pilih paket ini
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Tambah kuota pengguna di tengah masa langganan aktif: harga prorata sisa
// hari (pricing.ts). Setelah lunas, batas pengguna bertambah.
export function TopupPicker({
  pricing,
  daysLeft,
  untilLabel,
  payment,
}: {
  pricing: Pricing;
  daysLeft: number;
  untilLabel: string;
  payment: PaymentInfo;
}) {
  const [extra, setExtra] = useState(5);
  const [confirmed, setConfirmed] = useState(false);
  const price = topupPrice(pricing, extra, daysLeft);

  if (pricing.extraUserPrice <= 0) {
    return <p className="text-sm text-muted-foreground">Hubungi admin ArchiPay untuk menambah kuota pengguna.</p>;
  }

  if (confirmed) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setConfirmed(false)}>
            <ArrowLeftIcon />
            Ubah jumlah
          </Button>
        </div>
        <PaymentPanel
          title={`Tambah ${extra} pengguna s.d. ${untilLabel}`}
          amount={price}
          payment={payment}
          hidden={{ kind: "TOPUP", users: String(extra) }}
          onDone={() => setConfirmed(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <UserCountField
        id="topup-users"
        label="Tambahan pengguna"
        value={extra}
        min={1}
        onChange={setExtra}
        description={`${formatRupiah(pricing.extraUserPrice)}/pengguna/bulan × sisa ${daysLeft} hari (s.d. ${untilLabel}).`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xl font-semibold tabular-nums">{formatRupiah(price)}</p>
        <Button variant="brand" onClick={() => setConfirmed(true)} disabled={price <= 0}>
          Lanjut bayar
        </Button>
      </div>
    </div>
  );
}

function UserCountField({
  id,
  label,
  value,
  min,
  onChange,
  description,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
  description: string;
}) {
  const clamp = (next: number) => Math.min(MAX_USERS, Math.max(min, Math.round(next)));
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" onClick={() => onChange(clamp(value - 1))} aria-label="Kurangi">
          <MinusIcon />
        </Button>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={MAX_USERS}
          value={value}
          onChange={(event) => {
            const next = event.target.valueAsNumber;
            if (Number.isFinite(next)) onChange(clamp(next));
          }}
          className="w-24 text-center tabular-nums"
        />
        <Button type="button" variant="outline" size="icon" onClick={() => onChange(clamp(value + 1))} aria-label="Tambah">
          <PlusIcon />
        </Button>
      </div>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

// Rekening & QRIS tujuan + form "Saya sudah bayar". Dipakai untuk tagihan
// baru (hidden.months) dan untuk melengkapi kurang bayar (hidden.subscriptionId).
export function PaymentPanel({
  title,
  amount,
  payment,
  hidden,
  onDone,
}: {
  title: string;
  amount: number;
  payment: PaymentInfo;
  hidden: Record<string, string>;
  onDone?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-5">
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold tabular-nums">Transfer {formatRupiah(amount)}</p>
        <p className="text-sm text-muted-foreground">Transfer tepat sesuai nominal agar mudah dicocokkan.</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {payment.banks.length > 0 && (
          <ul className="grid flex-1 gap-3 sm:grid-cols-2">
            {payment.banks.map((bank) => (
              <li key={bank.id} className={cn("rounded-lg border-2 p-3 text-sm", bankAccentClass(bank.bankName))}>
                <p className="font-semibold">Transfer {bank.bankName}</p>
                <p className="font-mono text-lg font-semibold text-foreground tabular-nums">
                  {formatAccountNumber(bank.bankName, bank.accountNumber)}
                </p>
                <p className="text-foreground">a.n. {bank.accountName}</p>
              </li>
            ))}
          </ul>
        )}
        {payment.hasQris && (
          <div className="flex flex-col items-center gap-2 rounded-lg border p-3 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- gambar privat lewat route API */}
            <img src="/api/platform/qris" alt="QRIS pembayaran ArchiPay" className="size-48 bg-white object-contain" />
            <p className="text-muted-foreground">Pindai QRIS, isi nominal {formatRupiah(amount)}</p>
          </div>
        )}
        {payment.banks.length === 0 && !payment.hasQris && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Rekening pembayaran belum diatur. Hubungi admin ArchiPay.
          </p>
        )}
      </div>

      <ClaimForm hidden={hidden} onDone={onDone} />
    </div>
  );
}

function ClaimForm({ hidden, onDone }: { hidden: Record<string, string>; onDone?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  async function handleFileChange(selected: File | undefined) {
    setFile(null);
    if (!selected) return;
    setPreparing(true);
    const compressed = await compressImage(selected);
    setPreparing(false);
    if (compressed.size > PROOF_MAX_BYTES) {
      setError({ success: false, message: "Periksa kembali isian Anda.", fieldErrors: { proof: ["Ukuran bukti maksimal 4 MB"] } });
      return;
    }
    setError(null);
    setFile(compressed);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.delete("proof");
    if (file) formData.set("proof", file);
    startTransition(async () => {
      const result = await claimSubscriptionPaid(undefined, formData);
      if (result.success) {
        notify.success("Bukti terkirim. Admin ArchiPay akan memverifikasi pembayaran Anda.");
        onDone?.();
      } else {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="border-t pt-5">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FieldGroup>
        <Field data-invalid={!!fieldError("proof")}>
          <FieldLabel htmlFor="proof">Bukti transfer</FieldLabel>
          <Input
            id="proof"
            name="proof"
            type="file"
            accept="image/*,application/pdf"
            onChange={(event) => handleFileChange(event.target.files?.[0])}
            required
          />
          <FieldDescription>Foto/screenshot atau PDF bukti transfer, maks. 4 MB.</FieldDescription>
          <FieldError>{fieldError("proof")}</FieldError>
        </Field>
        <Field data-invalid={!!fieldError("note")}>
          <FieldLabel htmlFor="claim-note">Catatan (opsional)</FieldLabel>
          <Input id="claim-note" name="note" maxLength={255} autoComplete="off" placeholder="Misal: transfer dari BCA a.n. Budi, 10.15" />
          <FieldError>{fieldError("note")}</FieldError>
        </Field>
        <Field orientation="horizontal">
          <Button type="submit" variant="brand" disabled={pending || preparing || !file}>
            {pending || preparing ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
            Saya sudah bayar
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
