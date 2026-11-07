// Halaman /error-logs (Log Error, khusus Superadmin): error server dan browser
// dari semua perusahaan, dikelompokkan per masalah (BUSINESS-FLOW §21).
//
//   /error-logs                 Baru (bawaan)
//   /error-logs?status=RESOLVED Selesai, IGNORED Diabaikan, ALL semua
//   &source=SERVER_ACTION       saring sumber
//   &q=kode-atau-kata           cari kode error (digest), pesan, atau nama aksi

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorLogFilters } from "@/features/error-logs/components/error-log-filters";
import {
  ERROR_LOG_RETENTION_DAYS,
  ERROR_SOURCE_LABELS,
  ERROR_SOURCES,
  ERROR_STATUS_LABELS,
  ERROR_STATUS_TONES,
  ERROR_STATUSES,
  type ErrorSource,
  type ErrorStatus,
} from "@/features/error-logs/constants";
import { listErrorGroups } from "@/features/error-logs/queries";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Log Error",
};

const TABS: { value: string; label: string }[] = [
  { value: "NEW", label: "Baru" },
  { value: "RESOLVED", label: "Selesai" },
  { value: "IGNORED", label: "Diabaikan" },
  { value: "ALL", label: "Semua" },
];

export default function ErrorLogsPage({ searchParams }: PageProps<"/error-logs">) {
  return (
    <>
      <PageHeader
        title="Log error"
        description={`Error server dan browser dari semua perusahaan, dikelompokkan per masalah. Disimpan ${ERROR_LOG_RETENTION_DAYS} hari.`}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        {searchParams.then((params) => (
          <ErrorLogsContent params={params} />
        ))}
      </Suspense>
    </>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function ErrorLogsContent({ params }: { params: Record<string, string | string[] | undefined> }) {
  await requirePlatformAdmin();
  const statusParam = first(params.status);
  const tab = TABS.find((item) => item.value === statusParam)?.value ?? "NEW";
  const source = ERROR_SOURCES.find((item) => item === first(params.source));
  const q = first(params.q)?.trim().slice(0, 100) || undefined;
  const status = (ERROR_STATUSES as readonly string[]).includes(tab) ? (tab as ErrorStatus) : undefined;

  const groups = await listErrorGroups({ status, source, q });

  const hrefFor = (nextTab: string) => {
    const query = new URLSearchParams();
    if (nextTab !== "NEW") query.set("status", nextTab);
    if (source) query.set("source", source);
    if (q) query.set("q", q);
    const text = query.toString();
    return text ? `/error-logs?${text}` : "/error-logs";
  };
  // Link ke detail membawa filter yang sedang dipakai, agar setelah "Tandai selesai" /
  // "Abaikan" Superadmin kembali ke daftar yang sama (lihat error-logs/[fingerprint]).
  const filterQuery = hrefFor(tab).split("?")[1];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring status error">
        {TABS.map((item) => (
          <Link
            key={item.value}
            href={hrefFor(item.value)}
            aria-current={item.value === tab ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors",
              item.value === tab ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <ErrorLogFilters q={q ?? ""} source={source ?? ""} />

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {q || source || tab !== "NEW" ? "Tidak ada error yang cocok." : "Tidak ada error baru. Semua aman."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => (
            <li key={group.fingerprint}>
              <Link
                href={`/error-logs/${group.fingerprint}${filterQuery ? `?${filterQuery}` : ""}`}
                className="flex flex-col gap-2 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50 sm:p-4"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <ToneBadge tone={ERROR_STATUS_TONES[group.status]}>{ERROR_STATUS_LABELS[group.status]}</ToneBadge>
                  <ToneBadge tone="pending">{ERROR_SOURCE_LABELS[group.source as ErrorSource]}</ToneBadge>
                  <span className="ml-auto text-sm font-semibold tabular-nums">{group.count}×</span>
                </div>
                <p className="line-clamp-2 text-sm font-medium break-words">{group.message}</p>
                {(group.actionName || group.path) && (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {[group.actionName, group.path].filter(Boolean).join("  ·  ")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Terakhir {formatDateTime(group.lastSeen)}
                  {group.companyCount > 0 && ` · ${group.companyCount} perusahaan`}
                  {group.lastVersion && ` · v${group.lastVersion}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
