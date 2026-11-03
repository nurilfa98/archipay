// Daftar menu ArchiPay. Ditampilkan sebagai kotak ikon di halaman / (tepat
// setelah login) dan dipakai breadcrumb di header. Saat membuat fitur/halaman
// baru, cukup tambahkan satu baris di MENU_ITEMS.
//
// `permission` (opsional) menentukan siapa yang melihat menu tersebut. Bila
// berupa daftar, cukup punya SALAH SATU permission (lihat canSeeMenu).
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
  BanknoteIcon,
  CalendarCheckIcon,
  CreditCardIcon,
  FileClockIcon,
  FolderKanbanIcon,
  HouseIcon,
  ReceiptTextIcon,
  SettingsIcon,
  UsersIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import { can, type Permission, type PermissionSubject } from "@/lib/auth/permissions";

export type MenuItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  // Kata lain yang ikut dicocokkan oleh kolom pencarian menu.
  keywords?: string[];
  permission?: Permission | Permission[];
};

export function canSeeMenu(user: PermissionSubject, item: MenuItem) {
  if (!item.permission) return true;
  const permissions = Array.isArray(item.permission) ? item.permission : [item.permission];
  return permissions.some((permission) => can(user, permission));
}

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
    title: "Absensi",
    href: "/attendance",
    icon: CalendarCheckIcon,
    description: "Foto wajah, lokasi & absen kerja",
    keywords: ["absen", "hadir", "lokasi", "wajah", "selfie", "gps", "kehadiran"],
    permission: ["attendance:check-in", "attendance:view-all"],
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
    title: "Penggajian",
    href: "/payroll",
    icon: BanknoteIcon,
    description: "Data gaji, penggajian bulanan & slip gaji",
    keywords: ["gaji", "payroll", "slip", "tunjangan", "bpjs", "thr"],
    permission: "salary:manage",
  },
  {
    title: "Slip Gaji",
    href: "/payslips",
    icon: ReceiptTextIcon,
    description: "Slip gaji Anda setiap bulan",
    keywords: ["gaji", "slip", "payslip"],
    permission: "salary:view-own",
  },
  {
    title: "Pengguna",
    href: "/users",
    icon: UsersIcon,
    description: "Akun karyawan & role",
    keywords: ["user", "karyawan", "akun"],
    permission: ["user:manage", "user:manage-employee"],
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
    permission: "settings:view",
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
  { title: "Lokasi", href: "/attendance/locations", parent: "/attendance" },
  { title: "Foto wajah", href: "/attendance/faces", parent: "/attendance" },
  { title: "Daftar foto wajah", href: "/attendance/enroll", parent: "/attendance" },
  { title: "Absen", href: "/attendance/check", parent: "/attendance" },
  { title: "Hari ini", href: "/attendance/today", parent: "/attendance" },
  { title: "Cuti & izin", href: "/attendance/leave", parent: "/attendance" },
  { title: "Review bulanan", href: "/attendance/review", parent: "/attendance" },
  { title: "Data gaji", href: "/payroll/salaries", parent: "/payroll" },
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
