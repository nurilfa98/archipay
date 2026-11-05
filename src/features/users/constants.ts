// Konstanta fitur pengguna yang dipakai server & browser.

// Status akun di daftar pengguna (filter & badge). Urutan cek sama dengan
// StatusBadge (user-badges.tsx): nonaktif dulu, lalu belum mengganti password
// sementara (= belum pernah login), sisanya aktif.
export const USER_STATUS = ["ACTIVE", "PENDING_LOGIN", "INACTIVE"] as const;

export type UserStatus = (typeof USER_STATUS)[number];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Aktif",
  PENDING_LOGIN: "Menunggu login",
  INACTIVE: "Nonaktif",
};
