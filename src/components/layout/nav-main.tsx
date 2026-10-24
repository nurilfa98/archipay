// Daftar menu di sidebar.
//
// Client Component karena butuh usePathname() untuk menyorot menu aktif dan
// useSidebar() untuk menutup sidebar di HP setelah menu diklik.
//
// Komponen ini menerima `roles` (array string) dari server, bukan daftar menu.
// Alasannya: ikon lucide adalah fungsi, dan fungsi tidak bisa dikirim dari
// Server Component ke Client Component. Jadi daftar menu di-import langsung
// di sini, lalu difilter dengan can().
//
// Referensi:
// - https://ui.shadcn.com/docs/components/sidebar
// - node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import { can } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";
import { isNavActive, NAV_GROUPS } from "./nav-config";

export function NavMain({ roles }: { roles: Role[] }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can({ roles }, item.permission)),
  })).filter((group) => group.items.length > 0);

  return groups.map((group) => (
    <SidebarGroup key={group.label}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map((item) => (
          <SidebarMenuItem key={item.href}>
            {/* render={<Link />}: tombol dirender sebagai <a> milik Next.js.
                Ini pola Base UI (pengganti asChild di Radix). */}
            <SidebarMenuButton
              render={<Link href={item.href} />}
              isActive={isNavActive(pathname, item.href)}
              tooltip={item.title}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <item.icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  ));
}

// Ditampilkan oleh <Suspense> selama data user dimuat.
const SKELETON_WIDTHS = ["60%", "80%", "70%", "50%"];

export function NavMainSkeleton() {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {SKELETON_WIDTHS.map((width) => (
          <SidebarMenuItem key={width}>
            <SidebarMenuSkeleton showIcon width={width} />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
