// Halaman /error-logs/<fingerprint> (Superadmin): satu masalah beserta stack
// trace terbaru dan 20 kejadian terakhir (siapa, di perusahaan mana, halaman,
// versi aplikasi). BUSINESS-FLOW §21.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorStatusButtons } from "@/features/error-logs/components/error-status-buttons";
import { ERROR_SOURCE_LABELS, ERROR_STATUS_LABELS, ERROR_STATUS_TONES } from "@/features/error-logs/constants";
import { getErrorGroup } from "@/features/error-logs/queries";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Detail Error",
};

export default function ErrorDetailPage({ params, searchParams }: PageProps<"/error-logs/[fingerprint]">) {
  return (
    <>
      <PageHeader
        title="Detail error"
        description="Stack trace terbaru dan kejadian terakhir."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        {Promise.all([params, searchParams]).then(([{ fingerprint }, query]) => (
          <ErrorDetail fingerprint={fingerprint} listHref={listHrefOf(query)} />
        ))}
      </Suspense>
    </>
  );
}

// Daftar error dengan filter yang dibawa dari daftar (?status=&source=&q=).
function listHrefOf(query: Record<string, string | string[] | undefined>) {
  const out = new URLSearchParams();
  for (const key of ["status", "source", "q"]) {
    const value = Array.isArray(query[key]) ? query[key][0] : query[key];
    if (value) out.set(key, value.slice(0, 100));
  }
  const text = out.toString();
  return text ? `/error-logs?${text}` : "/error-logs";
}

async function ErrorDetail({ fingerprint, listHref }: { fingerprint: string; listHref: string }) {
  await requirePlatformAdmin();
  const group = fingerprint.length === 40 ? await getErrorGroup(fingerprint) : null;
  if (!group) notFound();
  const stack = group.occurrences.find((item) => item.stack)?.stack ?? null;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <ToneBadge tone={ERROR_STATUS_TONES[group.status]}>{ERROR_STATUS_LABELS[group.status]}</ToneBadge>
          <ToneBadge tone="pending">{ERROR_SOURCE_LABELS[group.source]}</ToneBadge>
          {group.errorName && <span className="font-mono text-xs text-muted-foreground">{group.errorName}</span>}
        </div>
        <p className="text-base font-medium break-words">{group.message}</p>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Jumlah kejadian">{group.count}×</Item>
          <Item label="Perusahaan terdampak">{group.companyCount}</Item>
          <Item label="Versi terakhir">{group.lastVersion ? `v${group.lastVersion}` : "-"}</Item>
          <Item label="Pertama terjadi">{formatDateTime(group.firstSeen)}</Item>
          <Item label="Terakhir terjadi">{formatDateTime(group.lastSeen)}</Item>
          <Item label="Aksi / route">
            <span className="font-mono text-xs break-all">{group.actionName ?? "-"}</span>
          </Item>
        </dl>
        {group.note && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Catatan: </span>
            {group.note}
          </p>
        )}
        <ErrorStatusButtons fingerprint={group.fingerprint} status={group.status} listHref={listHref} />
      </section>

      {stack && (
        <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Stack trace terbaru</h2>
            <CopyButton value={stack} label="Salin stack trace" successMessage="Stack trace disalin." />
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed">
            {stack}
          </pre>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Kejadian terakhir ({group.occurrences.length})</h2>
        <ul className="flex flex-col gap-2">
          {group.occurrences.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 rounded-xl border bg-card p-3 text-sm sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="font-medium">{formatDateTime(item.createdAt)}</span>
                <span className="text-xs text-muted-foreground">
                  {item.appVersion ? `v${item.appVersion}` : "versi tidak diketahui"}
                </span>
              </div>
              <p className="text-muted-foreground">
                {item.userName ?? "Pengguna tidak diketahui"}
                {item.role && ` (${item.role})`}
                {item.companyName && ` · ${item.companyName}`}
              </p>
              {item.path && (
                <p className="font-mono text-xs break-all text-muted-foreground">
                  {item.method ? `${item.method} ` : ""}
                  {item.path}
                </p>
              )}
              {item.digest && <p className="font-mono text-xs text-muted-foreground">Kode error: {item.digest}</p>}
              {item.context && (
                <p className="font-mono text-xs break-all text-muted-foreground">{JSON.stringify(item.context)}</p>
              )}
              {item.userAgent && <p className="truncate text-xs text-muted-foreground">{item.userAgent}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
