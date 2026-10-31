// Kartu satu tagihan langganan beserta riwayat pembayarannya. Server
// Component, dipakai di tiga tempat:
// - menu Tagihan (Superadmin, semua company): `admin` → tombol Terima/Tolak
//   pada pembayaran yang menunggu verifikasi, nama company tampil;
// - detail company → Langganan (Superadmin): `admin`, tanpa nama company;
// - menu Langganan (Owner): hanya melihat.
//
// Bukti transfer dibuka di tab baru lewat /api/subscription-payments/<id>/proof.

import { ExternalLinkIcon, FileTextIcon, ImageIcon } from "lucide-react";
import Link from "next/link";
import { ToneBadge } from "@/components/tone-badge";
import { formatDateTime, formatShortDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES,
  type SubscriptionStatus,
} from "../constants";
import { invoiceLabel } from "../labels";
import type { PaymentItem, SubscriptionItem } from "../queries";
import { PaymentReviewActions } from "./payment-review-actions";

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return <ToneBadge tone={SUBSCRIPTION_STATUS_TONES[status]}>{SUBSCRIPTION_STATUS_LABELS[status]}</ToneBadge>;
}

export function InvoiceCard({
  invoice,
  admin = false,
  showCompany = false,
}: {
  invoice: SubscriptionItem;
  admin?: boolean;
  showCompany?: boolean;
}) {
  const remaining = Math.max(invoice.price - invoice.amountPaid, 0);
  const needsAction = invoice.status === "CLAIMED";

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 text-sm",
        admin && needsAction && "border-indigo-300 ring-1 ring-indigo-200 dark:border-indigo-800 dark:ring-indigo-900",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {showCompany && (
            <Link href={`/companies/${invoice.companyId}`} className="font-semibold hover:underline">
              {invoice.companyName}
            </Link>
          )}
          <p className={cn(showCompany ? "text-muted-foreground" : "font-semibold")}>
            {invoiceLabel(invoice)} · {formatRupiah(invoice.price)}
          </p>
          <p className="text-xs text-muted-foreground">Dibuat {formatDateTime(invoice.createdAt)}</p>
        </div>
        <SubscriptionStatusBadge status={invoice.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Info label="Diterima" value={formatRupiah(invoice.amountPaid)} />
        {invoice.status !== "ACTIVE" && invoice.status !== "REJECTED" && (
          <Info label="Kurang" value={formatRupiah(remaining)} highlight={remaining > 0 && invoice.amountPaid > 0} />
        )}
        {invoice.startsAt && invoice.endsAt && (
          <Info label="Periode" value={`${formatShortDate(invoice.startsAt)} – ${formatShortDate(invoice.endsAt)}`} />
        )}
      </dl>

      {invoice.status === "REJECTED" && invoice.rejectionNote && (
        <p className="rounded-md bg-rose-50 p-2 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          Ditolak: {invoice.rejectionNote}
        </p>
      )}
      {invoice.note && <p className="text-muted-foreground">Catatan: {invoice.note}</p>}

      {invoice.payments.length > 0 && (
        <ol className="flex flex-col divide-y rounded-lg border">
          {invoice.payments.map((payment, index) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              index={index + 1}
              admin={admin}
              summary={`${invoice.companyName} · ${invoiceLabel(invoice)}`}
              remaining={remaining}
            />
          ))}
        </ol>
      )}
    </article>
  );
}

function PaymentRow({
  payment,
  index,
  admin,
  summary,
  remaining,
}: {
  payment: PaymentItem;
  index: number;
  admin: boolean;
  summary: string;
  remaining: number;
}) {
  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          Pembayaran {index}
          <span className="font-normal text-muted-foreground"> · {formatDateTime(payment.createdAt)}</span>
        </p>
        <ToneBadge tone={PAYMENT_STATUS_TONES[payment.status]}>{PAYMENT_STATUS_LABELS[payment.status]}</ToneBadge>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        {payment.proof ? (
          <a
            href={`/api/subscription-payments/${payment.id}/proof`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
          >
            {payment.proof === "pdf" ? <FileTextIcon className="size-4" /> : <ImageIcon className="size-4" />}
            Lihat bukti
            <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : (
          <span>Dicatat langsung oleh admin</span>
        )}
        {payment.amountReceived != null && <span>Diterima {formatRupiah(payment.amountReceived)}</span>}
      </div>
      {payment.note && <p className="text-muted-foreground">Catatan Owner: {payment.note}</p>}
      {payment.reviewNote && (
        <p className={payment.status === "REJECTED" ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"}>
          {payment.status === "REJECTED" ? "Alasan ditolak" : "Keterangan admin"}: {payment.reviewNote}
        </p>
      )}
      {admin && payment.status === "PENDING" && (
        <PaymentReviewActions paymentId={payment.id} summary={summary} remaining={remaining} />
      )}
    </li>
  );
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium tabular-nums", highlight && "text-amber-700 dark:text-amber-300")}>{value}</dd>
    </div>
  );
}
