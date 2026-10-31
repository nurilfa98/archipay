// Pasangan isian "Nama bank" + "Nomor rekening". Nama bank disimpan di state
// agar pola strip nomor rekening (lib/bank.ts) langsung berubah saat nama
// bank diketik, misalnya BCA 123-456-7890, Mandiri 123-00-1234567-8.
//
// Dipakai di form pengguna, profil, dan rekening Pengaturan platform.

"use client";

import { useState } from "react";
import { AccountNumberInput } from "@/components/account-number-input";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { accountNumberPlaceholder } from "@/lib/bank";

export function BankAccountFields({
  bankNameField = "bankName",
  accountField = "bankAccountNumber",
  defaultBankName,
  defaultAccountNumber,
  required = false,
  bankNameError,
  accountError,
  accountDescription,
}: {
  bankNameField?: string;
  accountField?: string;
  defaultBankName?: string | null;
  defaultAccountNumber?: string | null;
  required?: boolean;
  bankNameError?: string;
  accountError?: string;
  accountDescription?: string;
}) {
  const [bankName, setBankName] = useState(defaultBankName ?? "");

  return (
    <>
      <Field data-invalid={!!bankNameError}>
        <FieldLabel htmlFor={bankNameField}>Nama bank</FieldLabel>
        <Input
          id={bankNameField}
          name={bankNameField}
          placeholder="BCA"
          autoComplete="off"
          maxLength={50}
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          aria-invalid={!!bankNameError}
          required={required}
        />
        {!bankNameError && <FieldDescription>BCA, Mandiri, BRI, BNI, dll.</FieldDescription>}
        <FieldError>{bankNameError}</FieldError>
      </Field>
      <AccountNumberInput
        name={accountField}
        label="Nomor rekening"
        bankName={bankName}
        defaultValue={defaultAccountNumber}
        placeholder={accountNumberPlaceholder(bankName)}
        description={accountDescription ?? "Strip ditambahkan otomatis sesuai pola bank."}
        error={accountError}
        required={required}
      />
    </>
  );
}
