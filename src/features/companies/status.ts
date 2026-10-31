// Aturan warna & ikon status company (kartu, badge, chip saring di menu
// Company). Satu status = satu warna = satu ikon, mengikuti aturan warna
// ArchiPay di components/tone-badge.tsx, sehingga Superadmin cukup melihat
// warna kartu untuk tahu keadaan klien:
//
//   Masa gratis = indigo  (active)  : sedang mencoba, belum berlangganan
//   Aktif       = emerald (success) : berlangganan, aman
//   Tenggang    = amber   (warning) : masa aktif habis, masih bisa dipakai
//   Terkunci    = rose    (danger)  : belum memperpanjang, akses dikunci
//   Nonaktif    = slate   (pending) : dimatikan Superadmin
//
// Kartu memakai kelas .project-accent (globals.css) dengan hue status di
// bawah ini, sama seperti kartu project. Status dihitung dari masa langganan
// (lib/subscription-access.ts) + saklar Nonaktif.

import {
  BadgeCheckIcon,
  GiftIcon,
  HourglassIcon,
  LockIcon,
  PowerOffIcon,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { Tone } from "@/components/tone-badge";
import type { CompanyAccess } from "@/lib/subscription-access";

export const COMPANY_STATUSES = ["TRIAL", "ACTIVE", "GRACE", "LOCKED", "INACTIVE"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

type StatusStyle = {
  label: string;
  description: string;
  tone: Tone;
  icon: LucideIcon;
  // Hue oklch untuk .project-accent; null = abu-abu.
  hue: number | null;
  // Warna titik di chip saring.
  dotClass: string;
  // Chip saring tetap tampil walau jumlahnya 0.
  alwaysInFilter: boolean;
  // Urutan kartu: yang perlu tindakan Superadmin dulu.
  rank: number;
};

export const COMPANY_STATUS: Record<CompanyStatus, StatusStyle> = {
  TRIAL: {
    label: "Masa gratis",
    description: "Sedang mencoba, belum berlangganan",
    tone: "active",
    icon: GiftIcon,
    hue: 277,
    dotClass: "bg-indigo-500",
    alwaysInFilter: true,
    rank: 3,
  },
  ACTIVE: {
    label: "Aktif",
    description: "Berlangganan",
    tone: "success",
    icon: BadgeCheckIcon,
    hue: 163,
    dotClass: "bg-emerald-500",
    alwaysInFilter: true,
    rank: 3,
  },
  GRACE: {
    label: "Tenggang",
    description: "Masa aktif habis, belum dikunci",
    tone: "warning",
    icon: HourglassIcon,
    hue: 70,
    dotClass: "bg-amber-500",
    alwaysInFilter: false,
    rank: 1,
  },
  LOCKED: {
    label: "Terkunci",
    description: "Belum memperpanjang, akses dikunci",
    tone: "danger",
    icon: LockIcon,
    hue: 16,
    dotClass: "bg-rose-500",
    alwaysInFilter: false,
    rank: 0,
  },
  INACTIVE: {
    label: "Nonaktif",
    description: "Dimatikan Superadmin",
    tone: "pending",
    icon: PowerOffIcon,
    hue: null,
    dotClass: "bg-slate-400",
    alwaysInFilter: true,
    rank: 4,
  },
};

// Status company: Nonaktif (saklar manual) mengalahkan status langganan.
export function companyStatusOf(company: { isActive: boolean; access: CompanyAccess }): CompanyStatus {
  return company.isActive ? company.access.status : "INACTIVE";
}

// "Segera habis": masa gratis/langganan tinggal ≤ 7 hari (belum tenggang).
export function isExpiringSoon(company: { isActive: boolean; access: CompanyAccess }) {
  const status = companyStatusOf(company);
  return (status === "TRIAL" || status === "ACTIVE") && company.access.needsReminder;
}

// Terkunci → tenggang → segera habis → lainnya → nonaktif; lalu yang paling
// dekat habis, lalu nama.
export function compareCompanies(
  a: { name: string; isActive: boolean; access: CompanyAccess },
  b: { name: string; isActive: boolean; access: CompanyAccess },
) {
  const rank = (company: typeof a) =>
    isExpiringSoon(company) ? 2 : COMPANY_STATUS[companyStatusOf(company)].rank;
  return rank(a) - rank(b) || a.access.until.getTime() - b.access.until.getTime() || a.name.localeCompare(b.name);
}

export function companyAccentStyle(status: CompanyStatus): CSSProperties {
  const { hue } = COMPANY_STATUS[status];
  const vars: Record<string, number> =
    hue === null ? { "--project-hue": 260, "--project-chroma": 0 } : { "--project-hue": hue };
  return vars as CSSProperties;
}
