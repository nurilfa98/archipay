// Breadcrumb di navbar, diambil otomatis dari nav-config.ts berdasarkan URL
// yang sedang dibuka: "Grup menu > Menu", misalnya "Keuangan > Uang Muka".
//
// - Nama grup hanya teks (grup tidak punya halaman sendiri).
// - Di sub-halaman (misal /advances/123) nama menu menjadi link untuk
//   kembali ke daftarnya.
// - Beranda cukup "Beranda", tanpa grup "Utama".
//
// Referensi: https://ui.shadcn.com/docs/components/breadcrumb

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { isNavActive, NAV_GROUPS } from "./nav-config";

export function PageBreadcrumb() {
  const pathname = usePathname();
  const group = NAV_GROUPS.find((g) => g.items.some((i) => isNavActive(pathname, i.href)));
  const item = group?.items.find((i) => isNavActive(pathname, i.href));

  if (!group || !item) return <span className="truncate text-sm font-medium">ArchiPay</span>;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {item.href !== "/" && (
          <>
            <BreadcrumbItem>{group.label}</BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}
        <BreadcrumbItem className="min-w-0">
          {pathname === item.href ? (
            <BreadcrumbPage className="truncate font-medium">{item.title}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink className="truncate" render={<Link href={item.href} />}>
              {item.title}
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
