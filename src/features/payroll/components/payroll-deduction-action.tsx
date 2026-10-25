// Tombol + dialog "Tandai dipotong": catat sisa uang muka sebagai potongan
// gaji periode tertentu. Nominal awal = seluruh sisa; boleh diubah untuk
// mencicil (misal agar potongan tidak melebihi 50% upah).

"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { recordPayrollDeduction } from "@/features/payroll/actions";
import { AmountField } from "@/features/settlements/components/settlement-balance-action";
import { formatRupiah } from "@/lib/format";

export function PayrollDeductionAction({
  settlementId,
  outstanding,
  defaultPeriod,
  summary,
}: {
  settlementId: string;
  outstanding: number;
  defaultPeriod: string; // "2026-10"
  summary: string;
}) {
  return (
    <ActionDialog
      label="Tandai dipotong"
      variant="outline"
      title="Tandai sudah dipotong dari gaji?"
      description={`${summary}. Sisa ${formatRupiah(outstanding)}. Catat setelah potongan benar-benar diterapkan di penggajian.`}
      confirmLabel="Simpan"
      onConfirm={(formData) => recordPayrollDeduction(settlementId, formData)}
    >
      {(fieldError) => (
        <>
          <AmountField defaultValue={outstanding} error={fieldError("amount")} />
          <Field data-invalid={!!fieldError("period")}>
            <FieldLabel htmlFor="period">Periode gaji</FieldLabel>
            <Input id="period" name="period" type="month" defaultValue={defaultPeriod} required />
            <FieldDescription>
              Total potongan per periode maksimal 50% upah (PP 36/2021). Bila lebih, potong sebagian dan
              sisanya di periode berikutnya.
            </FieldDescription>
            <FieldError>{fieldError("period")}</FieldError>
          </Field>
        </>
      )}
    </ActionDialog>
  );
}
