// Konstanta log error (BUSINESS-FLOW §21). Tanpa import server, aman dipakai
// Client Component.

import type { Tone } from "@/components/tone-badge";

export const ERROR_SOURCES = ["SERVER_ACTION", "PAGE", "ROUTE", "CRON", "CLIENT", "EXTERNAL"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];

export const ERROR_SOURCE_LABELS: Record<ErrorSource, string> = {
  SERVER_ACTION: "Aksi server",
  PAGE: "Halaman",
  ROUTE: "API / route",
  CRON: "Tugas terjadwal",
  CLIENT: "Browser",
  EXTERNAL: "Layanan luar",
};

export const ERROR_STATUSES = ["NEW", "RESOLVED", "IGNORED"] as const;
export type ErrorStatus = (typeof ERROR_STATUSES)[number];

export const ERROR_STATUS_LABELS: Record<ErrorStatus, string> = {
  NEW: "Baru",
  RESOLVED: "Selesai",
  IGNORED: "Diabaikan",
};

export const ERROR_STATUS_TONES: Record<ErrorStatus, Tone> = {
  NEW: "danger",
  RESOLVED: "success",
  IGNORED: "pending",
};

// Catatan error dihapus otomatis setelah sekian hari (cron harian).
export const ERROR_LOG_RETENTION_DAYS = 60;
