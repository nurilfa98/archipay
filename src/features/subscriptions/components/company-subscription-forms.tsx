// Form di detail company → Langganan (Superadmin): harga khusus company ini
// (per komponen harga) dan pencatatan pembayaran langsung (tunai/transfer
// saat kunjungan) dengan harga yang dihitung otomatis.

"use client";

import { ReceiptIcon } from "lucide-react";
import { useState } from "react";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { formatRupiah } from "@/lib/format";
import { recordDirectPayment, saveCompanyPricing } from "../actions";
import { PLAN_LABELS, PLAN_MONTHS, type PlanMonths } from "../constants";
import { MAX_USERS, planPrice, type Pricing } from "../pricing";
import type { CompanyPricing } from "../queries";
import { SubmitButton } from "./platform-forms";
import { RupiahInput } from "./rupiah-input";
import { useFormAction } from "./use-form-action";

export function CompanyPricingForm({ companyId, pricing }: { companyId: string; pricing: CompanyPricing }) {
  const { pending, handleSubmit, fieldError } = useFormAction(saveCompanyPricing, "Harga khusus tersimpan.");
  const { standard, override } = pricing;

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="companyId" value={companyId} />
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-3">
          <RupiahInput
            name="basePrice"
            label="Harga dasar per bulan"
            defaultValue={override?.basePrice ?? null}
            placeholder={standard.basePrice.toLocaleString("id-ID")}
            description={`Standar: ${formatRupiah(standard.basePrice)}`}
            optional
            error={fieldError("basePrice")}
          />
          <Field data-invalid={!!fieldError("includedUsers")}>
            <FieldLabel htmlFor="includedUsers">Sudah termasuk (pengguna)</FieldLabel>
            <Input
              id="includedUsers"
              name="includedUsers"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_USERS}
              defaultValue={override?.includedUsers ?? ""}
              placeholder={String(standard.includedUsers)}
              className="w-28 tabular-nums"
            />
            <FieldDescription>Standar: {standard.includedUsers} pengguna</FieldDescription>
            <FieldError>{fieldError("includedUsers")}</FieldError>
          </Field>
          <RupiahInput
            name="extraUserPrice"
            label="Per pengguna tambahan / bulan"
            defaultValue={override?.extraUserPrice ?? null}
            placeholder={standard.extraUserPrice.toLocaleString("id-ID")}
            description={`Standar: ${formatRupiah(standard.extraUserPrice)}`}
            optional
            error={fieldError("extraUserPrice")}
          />
        </div>
        <Field data-invalid={!!fieldError("note")}>
          <FieldLabel htmlFor="pricing-note">Catatan negosiasi (opsional)</FieldLabel>
          <Input
            id="pricing-note"
            name="note"
            maxLength={255}
            defaultValue={override?.note ?? ""}
            placeholder="Misal: negosiasi 12 Nov 2026"
          />
          <FieldDescription>
            Kosongkan isian untuk memakai harga standar. Diskon 6 bulan & 1 tahun selalu mengikuti standar.
          </FieldDescription>
          <FieldError>{fieldError("note")}</FieldError>
        </Field>
        <SubmitButton pending={pending} label="Simpan harga khusus" />
      </FieldGroup>
    </form>
  );
}

// Dialog konfirmasi: pencatatan langsung = lunas, masa aktif & batas pengguna
// langsung berubah, jadi tidak boleh terjadi karena salah klik.
export function DirectPaymentAction({
  companyId,
  pricing,
  minUsers,
}: {
  companyId: string;
  pricing: Pricing;
  minUsers: number;
}) {
  const [months, setMonths] = useState<PlanMonths>(12);
  const [userCount, setUserCount] = useState(minUsers);

  if (pricing.basePrice <= 0) {
    return <p className="text-sm text-muted-foreground">Atur harga dasar paket di Pengaturan platform terlebih dahulu.</p>;
  }

  return (
    <ActionDialog
      label="Catat pembayaran langsung"
      icon={<ReceiptIcon />}
      showLabel
      variant="outline"
      title="Catat pembayaran langsung?"
      description="Untuk pembayaran tunai/transfer yang sudah Anda terima sendiri. Tagihan langsung lunas, masa aktif diperpanjang, dan batas pengguna mengikuti jumlah di bawah."
      confirmLabel={`Catat lunas ${formatRupiah(planPrice(pricing, months, userCount))}`}
      successMessage="Pembayaran tercatat, masa aktif diperpanjang."
      onConfirm={(formData) => recordDirectPayment(undefined, formData)}
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="companyId" value={companyId} />
          <Field data-invalid={!!fieldError("users")}>
            <FieldLabel htmlFor="direct-users">Jumlah pengguna</FieldLabel>
            <Input
              id="direct-users"
              name="users"
              type="number"
              inputMode="numeric"
              min={minUsers}
              max={MAX_USERS}
              value={userCount}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value)) setUserCount(Math.min(MAX_USERS, Math.max(1, Math.round(value))));
              }}
              className="w-28 tabular-nums"
              required
            />
            <FieldDescription>Minimal {minUsers} (termasuk harga dasar / pengguna aktif saat ini).</FieldDescription>
            <FieldError>{fieldError("users")}</FieldError>
          </Field>
          <FieldSet>
            <FieldLegend variant="label">Paket yang dibayar</FieldLegend>
            <RadioGroup
              name="months"
              value={String(months)}
              onValueChange={(value) => setMonths(Number(value) as PlanMonths)}
              className="flex flex-col gap-2"
            >
              {PLAN_MONTHS.map((option) => (
                <Field key={option} orientation="horizontal" className="rounded-lg border p-3">
                  <RadioGroupItem value={String(option)} id={`direct-${option}`} />
                  <FieldLabel htmlFor={`direct-${option}`} className="flex w-full justify-between font-normal">
                    <span className="font-medium">{PLAN_LABELS[option]}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatRupiah(planPrice(pricing, option, userCount))}
                    </span>
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
            <FieldError>{fieldError("months")}</FieldError>
          </FieldSet>
          <Field data-invalid={!!fieldError("note")}>
            <FieldLabel htmlFor="direct-note">Keterangan (opsional)</FieldLabel>
            <Input id="direct-note" name="note" maxLength={255} autoComplete="off" placeholder="Misal: tunai saat kunjungan 12 Nov" />
            <FieldError>{fieldError("note")}</FieldError>
          </Field>
        </>
      )}
    </ActionDialog>
  );
}
