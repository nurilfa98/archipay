// Konstanta project. Project mengelompokkan uang muka dan pertanggungjawaban:
// pengguna memilih project dulu, baru melihat/mengajukan uang muka di dalamnya.

export const PROJECT_STATUS = ["ACTIVE", "COMPLETED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Aktif",
  COMPLETED: "Selesai",
};

// Kunci ikon yang bisa dipilih Owner. Gambarnya ada di
// components/project-icon.tsx; kunci disimpan di database agar tidak
// bergantung pada nama komponen.
export const PROJECT_ICONS = [
  "building",
  "home",
  "hammer",
  "hard-hat",
  "factory",
  "store",
  "warehouse",
  "truck",
  "wrench",
  "zap",
  "landmark",
  "trees",
] as const;
export type ProjectIconKey = (typeof PROJECT_ICONS)[number];

export const DEFAULT_PROJECT_ICON: ProjectIconKey = "building";

export function isProjectIcon(value: string): value is ProjectIconKey {
  return (PROJECT_ICONS as readonly string[]).includes(value);
}

// Nilai ?project= di URL untuk uang muka lama yang belum punya project.
export const NO_PROJECT = "none";

// Nilai kontrak maksimal 13 digit, sama dengan batas nominal lain di aplikasi.
export const MAX_CONTRACT_DIGITS = 13;
