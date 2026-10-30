// Breadcrumb di header, diambil otomatis dari nav-config.ts berdasarkan URL
// yang sedang dibuka: "Menu > Project > Uang Muka".
//
// - "Menu" selalu kembali ke kotak menu di /.
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
import { matchesPath, MENU_ITEMS, SUB_PAGES } from "./nav-config";

type Crumb = { title: string; href: string };

function trailOf(pathname: string): Crumb[] {
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

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbLink render={<Link href="/" />}>Menu</BreadcrumbLink>
        </BreadcrumbItem>
        {trail.map((crumb, index) => (
          <CrumbItem
            key={crumb.href}
            crumb={crumb}
            // Item terakhir yang URL-nya persis = halaman ini (bukan link).
            current={index === trail.length - 1 && pathname === crumb.href}
            first={index === 0}
          />
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function CrumbItem({ crumb, current, first }: { crumb: Crumb; current: boolean; first: boolean }) {
  return (
    <>
      <BreadcrumbSeparator className={first ? "hidden sm:inline-flex" : undefined} />
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
