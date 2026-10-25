// Daftar menu sidebar. Saat membuat fitur/halaman baru, cukup tambahkan
// satu baris di sini; sidebar dan judul navbar otomatis mengikuti.
//
// `permission` (opsional) menentukan siapa yang melihat menu tersebut.
// Ini hanya soal tampilan: halamannya sendiri tetap wajib memanggil
// requirePermission() dari lib/auth/dal.ts.

import {
  FileClockIcon,
  HandCoinsIcon,
  HouseIcon,
  ReceiptTextIcon,
  SettingsIcon,
  UsersIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Utama",
    items: [{ title: "Beranda", href: "/", icon: HouseIcon }],
  },
  {
    label: "Keuangan",
    items: [
      { title: "Uang Muka", href: "/advances", icon: HandCoinsIcon, permission: "advance:view-own" },
      { title: "Pertanggungjawaban", href: "/settlements", icon: ReceiptTextIcon, permission: "settlement:submit" },
      { title: "Potong Gaji", href: "/payroll-deductions", icon: WalletCardsIcon, permission: "payroll:manage" },
    ],
  },
  {
    label: "Administrasi",
    items: [
      { title: "Pengguna", href: "/users", icon: UsersIcon, permission: "user:manage" },
      { title: "Audit Log", href: "/audit", icon: FileClockIcon, permission: "audit:view" },
      { title: "Pengaturan", href: "/settings", icon: SettingsIcon, permission: "settings:manage" },
    ],
  },
];

// Menu aktif: "/" hanya cocok persis, menu lain juga aktif di sub-halamannya
// (misal /advances/123 tetap menyorot "Uang Muka").
export function isNavActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
