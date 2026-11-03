// Tanda status harian satu absen (BUSINESS-FLOW §18.8), dihitung dari data
// absen saat ditampilkan, tidak disimpan. Fungsi murni.

import type { Tone } from "@/components/tone-badge";
import { localTime } from "./clock";

export type DayTag = { label: string; tone: Tone };

type RecordLike = {
  workDate: string;
  timezone: string;
  isWorkDay: boolean;
  lateMinutes: number;
  earlyMinutes: number | null;
  checkInInRadius: boolean;
  checkOutAt: Date | null;
  checkOutInRadius: boolean | null;
};

export function dayTags(record: RecordLike, now: Date): DayTag[] {
  const tags: DayTag[] = [];
  if (!record.isWorkDay) tags.push({ label: "Hari libur", tone: "pending" });
  if (record.lateMinutes > 0) tags.push({ label: `Terlambat ${record.lateMinutes} mnt`, tone: "warning" });
  if ((record.earlyMinutes ?? 0) > 0) tags.push({ label: `Pulang cepat ${record.earlyMinutes} mnt`, tone: "warning" });
  if (!record.checkInInRadius || record.checkOutInRadius === false) {
    tags.push({ label: "Di luar radius", tone: "danger" });
  }
  if (!record.checkOutAt) {
    tags.push(
      record.workDate < localTime(now, record.timezone).date
        ? { label: "Tidak absen pulang", tone: "danger" }
        : { label: "Belum pulang", tone: "active" },
    );
  }
  if (tags.length === 0) tags.push({ label: "Hadir", tone: "success" });
  return tags;
}
