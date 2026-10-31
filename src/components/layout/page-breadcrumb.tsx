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
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { isPlatformPath, matchesPath, MENU_ITEMS, PLATFORM_PAGES, SUB_PAGES } from "./nav-config";

type Crumb = { title: string; href: string };

function trailOf(pathname: string): Crumb[] {
  const platform = PLATFORM_PAGES.find((page) => matchesPath(pathname, page.href));
  if (platform) return [platform];
  const menu = MENU_ITEMS.find((item) => matchesPath(pathname, item.href));
  if (menu) return [menu];
  const sub = SUB_PAGES.find((page) => matchesPath(pathname, page.href));
  if (!sub) return [];
  const parent = MENU_ITEMS.find((item) => item.href === sub.parent);
  return parent ? [parent, sub] : [sub];
}

export function PageBreadcrumb() {
  const pathname = usePathname();
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
  current,
  first,
  separator,
}: {
  crumb: Crumb;
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
          <BreadcrumbLink className="truncate" render={<Link href={crumb.href} />}>
            {crumb.title}
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
    </>
  );
}
