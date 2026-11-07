// Halaman /companies/[id] (platform, khusus Superadmin): ringkasan company,
// langganan (masa aktif, tagihan, harga khusus, catat pembayaran langsung),
// daftar Owner, ubah data, aktif/nonaktif, hapus company (permanen), dan
// tombol masuk ke company.
//
// Owner tambahan & pengguna lain dikelola dari menu Pengguna setelah masuk
// ke company (Superadmin boleh memberi role Owner, lihat features/users/access.ts).
//
// [id] adalah dynamic segment. Dengan cacheComponents, nilai params baru
// diketahui saat request, jadi aksesnya wajib di dalam <Suspense>.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyDeleteAction } from "@/features/companies/components/company-delete-action";
import { CompanyStatusBadge } from "@/features/companies/components/company-status-badge";
import { CompanyEditForm } from "@/features/companies/components/company-form";
import { CompanyStatusAction } from "@/features/companies/components/company-status-action";
import { EnterCompanyButton } from "@/features/companies/components/enter-company-button";
import { getCompany } from "@/features/companies/queries";
import { companyStatusOf } from "@/features/companies/status";
import { accessLabel } from "@/features/companies/components/company-card";
import { CompanyPricingForm, DirectPaymentAction } from "@/features/subscriptions/components/company-subscription-forms";
import { InvoiceCard } from "@/features/subscriptions/components/invoice-card";
import { minPlanUsers } from "@/features/subscriptions/pricing";
import { getAddonCoverage, getCompanyPricing, listSubscriptions } from "@/features/subscriptions/queries";
import { ADDON_KEYS, ADDON_LABELS, isTrialOnly } from "@/lib/addons";
import { companyIdSchema } from "@/features/companies/schemas";
import { StatusBadge } from "@/features/users/components/user-badges";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { formatDate, formatShortDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Detail Perusahaan",
};

export default function CompanyDetailPage({ params }: PageProps<"/companies/[id]">) {
  return (
    <>
      <Suspense fallback={<CompanyDetailSkeleton />}>
        {params.then(({ id }) => (
          <CompanyDetailContent id={id} />
        ))}
      </Suspense>
    </>
  );
}

async function CompanyDetailContent({ id }: { id: string }) {
  const user = await requirePlatformAdmin();
  const parsedId = companyIdSchema.safeParse(id);
  const company = parsedId.success ? await getCompany(parsedId.data) : null;
  if (!company) notFound();
  const status = companyStatusOf(company);
  const [pricing, invoices, addons] = await Promise.all([
    getCompanyPricing(company.id),
    listSubscriptions({ companyId: company.id, limit: 24 }),
    getAddonCoverage(company.id),
  ]);

  return (
    <>
      <PageHeader
        title={company.name}
        description={`Bergabung ${formatDate(company.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <CompanyStatusBadge status={status} />
            <EnterCompanyButton companyId={company.id} active={user.company?.id === company.id} />
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <Item label="Pengguna aktif">{company.userCount}</Item>
            <Item label="Pengguna nonaktif">{company.inactiveUserCount}</Item>
            <Item label="Proyek">{company.projectCount}</Item>
            <Item label="Telepon / WhatsApp">{company.phoneNumber ? formatPhone(company.phoneNumber) : "-"}</Item>
            <Item label="Alamat">{company.address ?? "-"}</Item>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Langganan</CardTitle>
          <CardDescription>
            <span className="block">
              {accessLabel(company, status)} · {company.userCount} dari {company.userLimit} pengguna aktif
            </span>
            {ADDON_KEYS.map((key) => {
              const coverage = addons?.[key];
              const text =
                coverage?.active && coverage.until
                  ? `Add-on ${ADDON_LABELS[key]} aktif s.d. ${formatShortDate(coverage.until)}${isTrialOnly(coverage) ? " (masa gratis)" : ""}`
                  : `Add-on ${ADDON_LABELS[key]} (Nonaktif)`;
              return (
                <span key={key} className="block">
                  {text}
                </span>
              );
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Pembayaran yang dikirim Owner diverifikasi di menu Tagihan atau langsung di bawah ini. Untuk pembayaran
              tunai/transfer yang Anda terima sendiri, catat langsung:
            </p>
            <div>
              <DirectPaymentAction
                companyId={company.id}
                pricing={pricing.pricing}
                minUsers={minPlanUsers(pricing.pricing, company.userCount)}
                defaultAddons={company.addons}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Tagihan</h3>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada tagihan.</p>
            ) : (
              invoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} admin />)
            )}
          </div>

          <div className="flex flex-col gap-3 border-t pt-6">
            <h3 className="text-sm font-medium">Harga khusus perusahaan ini</h3>
            <CompanyPricingForm companyId={company.id} pricing={pricing} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner</CardTitle>
          <CardDescription>
            Untuk menambah Owner lain, reset password, atau menonaktifkan akun, buka perusahaan ini lalu pilih menu
            Pengguna.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {company.owners.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada Owner.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {company.owners.map((owner) => (
                <li key={owner.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{owner.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{owner.email}</p>
                  </div>
                  <StatusBadge user={owner} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data perusahaan</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyEditForm company={company} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyStatusAction company={company} />
        </CardContent>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Hapus perusahaan</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyDeleteAction company={company} />
        </CardContent>
      </Card>
    </>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CompanyDetailSkeleton() {
  return (
    <>
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-96 w-full" />
    </>
  );
}
