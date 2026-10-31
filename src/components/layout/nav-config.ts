// Daftar menu ArchiPay. Ditampilkan sebagai kotak ikon di halaman / (tepat
// setelah login) dan dipakai breadcrumb di header. Saat membuat fitur/halaman
// baru, cukup tambahkan satu baris di MENU_ITEMS.
//
// `permission` (opsional) menentukan siapa yang melihat menu tersebut.
// Ini hanya soal tampilan: halamannya sendiri tetap wajib memanggil
// requirePermission() dari lib/auth/dal.ts.
//
// Kotak menu hanya berisi menu milik company yang sedang dibuka. Halaman
// platform Superadmin (/companies) BUKAN menu di sini: Superadmin langsung
// mendarat di sana setelah login dan kembali lewat tombol Ganti/Keluar di pita
// company (lihat PLATFORM_PAGES).
//
// Uang Muka & Pertanggungjawaban BUKAN menu: keduanya dibuka dari kartu
// project (menu Project), jadi selalu terikat ke satu project. Keduanya ada di
// SUB_PAGES agar breadcrumb tetap bisa menampilkan "Project > Uang Muka".

import {
  CreditCardIcon,
  FileClockIcon,
  FolderKanbanIcon,
  HouseIcon,
  SettingsIcon,
  UsersIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export type MenuItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  // Kata lain yang ikut dicocokkan oleh kolom pencarian menu.
  keywords?: string[];
  permission?: Permission;
};

export const MENU_ITEMS: MenuItem[] = [
  {
    title: "Beranda",
    href: "/beranda",
    icon: HouseIcon,
    description: "Ringkasan uang muka & keuangan",
    keywords: ["dashboard", "ringkasan", "keuntungan", "laporan"],
  },
  {
    title: "Project",
    href: "/projects",
    icon: FolderKanbanIcon,
    description: "Uang muka & pertanggungjawaban per project",
    keywords: ["uang muka", "pertanggungjawaban", "nota", "kasbon", "pengajuan"],
    permission: "advance:view-own",
  },
  {
    title: "Potong Gaji",
    href: "/payroll-deductions",
    icon: WalletCardsIcon,
    description: "Sisa uang muka yang dipotong dari gaji",
    keywords: ["payroll", "gaji", "excel"],
    permission: "payroll:view",
  },
  {
    title: "Pengguna",
    href: "/users",
    icon: UsersIcon,
    description: "Akun karyawan & role",
    keywords: ["user", "karyawan", "akun"],
    permission: "user:manage",
  },
  {
    title: "Audit Log",
    href: "/audit",
    icon: FileClockIcon,
    description: "Riwayat perubahan data",
    keywords: ["riwayat", "log", "jejak"],
    permission: "audit:view",
  },
  {
    title: "Pengaturan",
    href: "/settings",
    icon: SettingsIcon,
    description: "Batas waktu, kategori biaya, dan lainnya",
    keywords: ["setting", "kategori", "batas"],
    permission: "settings:manage",
  },
  {
    title: "Langganan",
    href: "/subscription",
    icon: CreditCardIcon,
    description: "Masa aktif, paket & tagihan ArchiPay",
    keywords: ["bayar", "paket", "perpanjang", "tagihan", "billing"],
    permission: "subscription:view",
  },
];

// Halaman yang bukan menu, tetapi tampil di breadcrumb di bawah induknya.
export const SUB_PAGES: { title: string; href: string; parent?: string }[] = [
  { title: "Uang Muka", href: "/advances", parent: "/projects" },
  { title: "Pertanggungjawaban", href: "/settlements", parent: "/projects" },
  { title: "Profil", href: "/profile" },
];

// Halaman platform Superadmin (tidak terikat company), berpindah lewat tab di
// app/(app)/(platform)/layout.tsx. Di halaman ini breadcrumb tidak
// menampilkan "Menu" dan tombol kembali ke menu disembunyikan.
export const PLATFORM_PAGES: { title: string; href: string }[] = [
  { title: "Company", href: "/companies" },
  { title: "Tagihan", href: "/billing" },
  { title: "Pengaturan platform", href: "/platform-settings" },
];

export function isPlatformPath(pathname: string) {
  return PLATFORM_PAGES.some((page) => matchesPath(pathname, page.href));
}

// Halaman cocok dengan menu bila URL-nya sama atau berada di bawahnya
// (misal /projects/123 tetap termasuk "Project").
export function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
