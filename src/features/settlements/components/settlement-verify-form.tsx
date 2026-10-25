// Form verifikasi (OWNER/FINANCE): setiap nota disetujui atau ditolak
// (alasan wajib), lalu "Selesaikan verifikasi". Ringkasan saldo dihitung
// langsung di layar sebagai gambaran; angka resminya dihitung server dari
// ledger saat disimpan.
//
// "Kembalikan untuk diperbaiki" mengirim laporan kembali ke karyawan
// (misal foto buram) tanpa menyimpan keputusan per nota.

"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ActionDialog, ReasonField } from "@/features/advances/components/action-dialog";
import { requestSettlementRevision, verifySettlement } from "@/features/settlements/actions";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReceiptLink, type SettlementItemRow } from "./settlement-items-table";

type Decision = { approved?: boolean; reason: string };

const MIN_REASON = 5;

export function SettlementVerifyForm({
  settlementId,
  items,
  advanceAmount,
  summary,
}: {
  settlementId: string;
  items: SettlementItemRow[];
  advanceAmount: number;
  summary: string; // "PJ-2026-10-0001 · Budi"
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});

  const decisionOf = (id: string): Decision => decisions[id] ?? { reason: "" };
  const update = (id: string, change: Partial<Decision>) => {
    setDecisions((current) => ({ ...current, [id]: { ...decisionOf(id), ...change } }));
    setServerErrors((current) => ({ ...current, [`reason:${id}`]: [] }));
  };

  const approvedTotal = items
    .filter((item) => decisionOf(item.id).approved === true)
    .reduce((sum, item) => sum + item.amount, 0);
  const rejectedTotal = items
    .filter((item) => decisionOf(item.id).approved === false)
    .reduce((sum, item) => sum + item.amount, 0);
  const balance = advanceAmount - approvedTotal;
  const undecided = items.filter((item) => decisionOf(item.id).approved === undefined).length;
  const missingReason = items.some(
    (item) => decisionOf(item.id).approved === false && decisionOf(item.id).reason.trim().length < MIN_REASON,
  );
  const ready = undecided === 0 && !missingReason;

  async function handleVerify() {
    const result = await verifySettlement(
      settlementId,
      items.map((item) => {
        const decision = decisionOf(item.id);
        return { itemId: item.id, approved: decision.approved === true, reason: decision.reason };
      }),
    );
    if (!result.success && result.fieldErrors) {
      setServerErrors(result.fieldErrors);
      return { success: false as const, message: result.message };
    }
    return result;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const decision = decisionOf(item.id);
          const reasonError =
            serverErrors[`reason:${item.id}`]?.[0] ??
            (decision.approved === false && decision.reason.length > 0 && decision.reason.trim().length < MIN_REASON
              ? `Alasan minimal ${MIN_REASON} karakter`
              : undefined);
          return (
            <li
              key={item.id}
              className={cn(
                "flex flex-col gap-3 rounded-lg border bg-card p-4",
                decision.approved === true && "border-emerald-300 dark:border-emerald-800",
                decision.approved === false && "border-rose-300 dark:border-rose-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    {item.receiptDateLabel} · {item.categoryName}
                  </span>
                  <span className="font-medium">{item.description}</span>
                  <ReceiptLink item={item} />
                </div>
                <span className="font-semibold tabular-nums">{formatRupiah(item.amount)}</span>
              </div>

              <div className="flex flex-wrap gap-2" role="group" aria-label={`Keputusan untuk ${item.description}`}>
                <Button
                  type="button"
                  size="sm"
                  variant={decision.approved === true ? "default" : "outline"}
                  aria-pressed={decision.approved === true}
                  onClick={() => update(item.id, { approved: true })}
                >
                  <CheckIcon />
                  Setujui
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={decision.approved === false ? "destructive" : "outline"}
                  aria-pressed={decision.approved === false}
                  onClick={() => update(item.id, { approved: false })}
                >
                  <XIcon />
                  Tolak
                </Button>
              </div>

              {decision.approved === false && (
                <Field data-invalid={!!reasonError}>
                  <FieldLabel htmlFor={`reason-${item.id}`}>Alasan penolakan</FieldLabel>
                  <Textarea
                    id={`reason-${item.id}`}
                    value={decision.reason}
                    maxLength={500}
                    placeholder="Contoh: Nota bukan untuk keperluan proyek ini"
                    onChange={(event) => update(item.id, { reason: event.target.value })}
                    aria-invalid={!!reasonError}
                  />
                  <FieldError>{reasonError}</FieldError>
                </Field>
              )}
            </li>
          );
        })}
      </ul>

      <dl className="grid gap-x-6 gap-y-3 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-4">
        <SummaryItem label="Dana diterima" value={formatRupiah(advanceAmount)} />
        <SummaryItem label="Nota disetujui" value={formatRupiah(approvedTotal)} />
        <SummaryItem label="Nota ditolak" value={formatRupiah(rejectedTotal)} />
        <SummaryItem
          label={balance > 0 ? "Sisa dikembalikan karyawan" : balance < 0 ? "Diganti kantor" : "Selisih"}
          value={formatRupiah(Math.abs(balance))}
          emphasis
        />
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <ActionDialog
          label="Selesaikan verifikasi"
          disabled={!ready}
          title="Selesaikan verifikasi?"
          description={`${summary}. Nota disetujui ${formatRupiah(approvedTotal)}. ${outcomeText(balance)} Keputusan tidak bisa diubah setelah disimpan.`}
          confirmLabel="Simpan hasil verifikasi"
          successMessage="Hasil verifikasi disimpan."
          onConfirm={handleVerify}
        />
        <ActionDialog
          label="Kembalikan untuk diperbaiki"
          variant="outline"
          title="Kembalikan untuk diperbaiki?"
          description="Laporan dikirim kembali ke karyawan beserta catatan Anda. Keputusan per nota di atas tidak disimpan."
          confirmLabel="Kembalikan"
          successMessage="Laporan dikembalikan ke karyawan untuk diperbaiki."
          onConfirm={(formData) => requestSettlementRevision(settlementId, String(formData.get("reason") ?? ""))}
        >
          {(fieldError) => (
            <ReasonField
              label="Catatan perbaikan"
              placeholder="Contoh: Foto nota bensin buram, mohon foto ulang"
              error={fieldError("reason")}
            />
          )}
        </ActionDialog>
        {undecided > 0 && (
          <Button type="button" variant="ghost" onClick={() => items.forEach((item) => decisionOf(item.id).approved === undefined && update(item.id, { approved: true }))}>
            Setujui {undecided} nota tersisa
          </Button>
        )}
      </div>
    </div>
  );
}

function outcomeText(balance: number) {
  if (balance > 0) return `Karyawan wajib mengembalikan sisa ${formatRupiah(balance)}.`;
  if (balance < 0) return `Kantor wajib mengganti kekurangan ${formatRupiah(-balance)}.`;
  return "Saldo lunas, uang muka selesai.";
}

function SummaryItem({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", emphasis ? "text-base font-semibold" : "font-medium")}>{value}</dd>
    </div>
  );
}
