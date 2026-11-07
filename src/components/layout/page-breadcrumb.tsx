// Breadcrumb di header, diambil otomatis dari nav-config.ts berdasarkan URL
// yang sedang dibuka: "Menu > Project > Uang Muka".
//
// - "Menu" kembali ke kotak menu di /, kecuali di halaman platform
//   Superadmin (/companies) yang tidak berada di bawah kotak menu.
// - Di sub-halaman (misal /projects/123) nama menu menjadi link untuk
//   kembali ke daftarnya.
//
// Referensi: https://ui.shadcn.com/docs/components/breadcrumb

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { isPlatformPath, matchesPath, MENU_ITEMS, PLATFORM_PAGES, SUB_PAGES } from "./nav-config";

type Crumb = { title: string; href: string; keepParams?: string[]; detailOf?: boolean };

function trailOf(pathname: string): Crumb[] {
  const platform = PLATFORM_PAGES.find((page) => matchesPath(pathname, page.href));
  if (platform) return [platform];
  // Sub-halaman dicek lebih dulu karena bisa berada DI BAWAH URL menu
  // (misal /attendance/locations di bawah menu Absensi).
  const sub = SUB_PAGES.find((page) => matchesPath(pathname, page.href));
  const menu = MENU_ITEMS.find((item) => matchesPath(pathname, item.href));
  if (!sub) return menu ? [menu] : [];
  const parent = MENU_ITEMS.find((item) => item.href === sub.parent);
  return parent ? [parent, sub] : [sub];
}

// Link crumb: membawa query yang dibutuhkan halaman tujuan, supaya crumb yang
// diklik membuka halaman itu sendiri (bukan terlempar ke halaman lain).
function hrefOf(crumb: Crumb, pathname: string, searchParams: URLSearchParams) {
  const query = new URLSearchParams();
  for (const key of crumb.keepParams ?? []) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  if (crumb.detailOf && !query.has("project")) {
    const id = pathname.startsWith(`${crumb.href}/`) ? pathname.slice(crumb.href.length + 1).split("/")[0] : "";
    if (id && id !== "new" && id !== "request") query.set("from", id);
  }
  const text = query.toString();
  return text ? `${crumb.href}?${text}` : crumb.href;
}

export function PageBreadcrumb() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname === "/") return null;
  const trail = trailOf(pathname);
  const showMenu = !isPlatformPath(pathname);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {showMenu && (
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink render={<Link href="/" />}>Menu</BreadcrumbLink>
          </BreadcrumbItem>
        )}
        {trail.map((crumb, index) => (
          <CrumbItem
            key={crumb.href}
            crumb={crumb}
            // Item terakhir yang URL-nya persis = halaman ini (bukan link).
            current={index === trail.length - 1 && pathname === crumb.href}
            href={hrefOf(crumb, pathname, searchParams)}
            first={index === 0}
            separator={showMenu || index > 0}
          />
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function CrumbItem({
  crumb,
  href,
  current,
  first,
  separator,
}: {
  crumb: Crumb;
  href: string;
  current: boolean;
  first: boolean;
  separator: boolean;
}) {
  return (
    <>
      {separator && <BreadcrumbSeparator className={first ? "hidden sm:inline-flex" : undefined} />}
      <BreadcrumbItem className="min-w-0">
        {current ? (
          <BreadcrumbPage className="truncate font-medium">{crumb.title}</BreadcrumbPage>
        ) : (
          <BreadcrumbLink className="truncate" render={<Link href={href} />}>
            {crumb.title}
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
    </>
  );
}
