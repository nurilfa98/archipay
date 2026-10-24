// Judul halaman di navbar, diambil otomatis dari nav-config.ts
// berdasarkan URL yang sedang dibuka.

"use client";

import { usePathname } from "next/navigation";
import { isNavActive, NAV_GROUPS } from "./nav-config";

export function PageTitle() {
  const pathname = usePathname();
  const item = NAV_GROUPS.flatMap((group) => group.items).find((i) => isNavActive(pathname, i.href));

  return <span className="truncate text-sm font-medium">{item?.title ?? "ArchiPay"}</span>;
}
