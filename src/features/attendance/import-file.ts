// Membaca file impor lokasi (.xlsx atau .csv) di browser menjadi baris
// lokasi. Template .xlsx diunduh dari /api/attendance/locations/template;
// kolomnya dicocokkan berdasarkan JUDUL (urutan kolom boleh berbeda).
//
// Validasi sebenarnya tetap di server (importLocations); di sini hanya
// membaca & merapikan teks.

import { ATTENDANCE_TIMEZONES, type AttendanceTimezone } from "./constants";
import { formatMinutes } from "./schedule";

export const IMPORT_COLUMNS = {
  name: "Nama lokasi",
  coordinates: "Koordinat",
  radius: "Radius (meter)",
  timezone: "Zona waktu",
  project: "Project",
  workStart: "Jam masuk",
  workEnd: "Jam pulang",
} as const;

export type DraftLocation = {
  key: string;
  name: string;
  coordinates: string;
  radius: string;
  timezone: AttendanceTimezone;
  projectName: string;
  workStart: string;
  workEnd: string;
};

type Cell = string | number | boolean | Date | null | undefined;

export async function readLocationFile(file: File, defaults: { radius: string; timezone: AttendanceTimezone }) {
  const rows = file.name.toLowerCase().endsWith(".csv") ? parseCsv(await file.text()) : await readXlsx(file);
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === normalize(IMPORT_COLUMNS.name)));
  if (headerIndex === -1) {
    throw new Error(`Kolom "${IMPORT_COLUMNS.name}" tidak ditemukan. Pakai template dari tombol "Unduh template".`);
  }

  const header = rows[headerIndex].map(normalize);
  const col = (title: string) => header.indexOf(normalize(title));
  const columns = {
    name: col(IMPORT_COLUMNS.name),
    coordinates: col(IMPORT_COLUMNS.coordinates),
    radius: col(IMPORT_COLUMNS.radius),
    timezone: col(IMPORT_COLUMNS.timezone),
    project: col(IMPORT_COLUMNS.project),
    workStart: col(IMPORT_COLUMNS.workStart),
    workEnd: col(IMPORT_COLUMNS.workEnd),
  };
  if (columns.coordinates === -1) throw new Error(`Kolom "${IMPORT_COLUMNS.coordinates}" tidak ditemukan.`);

  const cell = (row: Cell[], index: number) => (index === -1 ? "" : text(row[index]));
  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((value) => text(value) !== ""))
    .map((row, index): DraftLocation => ({
      key: `file-${index}-${Date.now()}`,
      name: cell(row, columns.name),
      coordinates: cell(row, columns.coordinates),
      radius: cell(row, columns.radius) || defaults.radius,
      timezone: toTimezone(cell(row, columns.timezone)) ?? defaults.timezone,
      projectName: cell(row, columns.project),
      workStart: time(columns.workStart === -1 ? null : row[columns.workStart]),
      workEnd: time(columns.workEnd === -1 ? null : row[columns.workEnd]),
    }));
}

async function readXlsx(file: File): Promise<Cell[][]> {
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(file, 1)) as Cell[][];
}

// CSV sederhana: pemisah koma atau titik koma (Excel berbahasa Indonesia
// menyimpan CSV dengan titik koma), nilai boleh diapit tanda kutip.
function parseCsv(content: string): Cell[][] {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.find((line) => line.trim()) ?? "";
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        cells.push(current);
        current = "";
      } else current += char;
    }
    cells.push(current);
    return cells;
  });
}

function normalize(value: Cell) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function text(value: Cell) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

// "WIB" / "wita" / "Asia/Jayapura" → nilai zona waktu.
function toTimezone(value: string): AttendanceTimezone | null {
  const upper = value.trim().toUpperCase();
  const zone = ATTENDANCE_TIMEZONES.find((item) => item.label === upper || item.value.toUpperCase() === upper);
  return zone?.value ?? null;
}

// Jam dari Excel bisa berupa teks "07.30", pecahan hari (0,3125), atau Date.
function time(value: Cell): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return formatMinutes(value.getUTCHours() * 60 + value.getUTCMinutes()).replace(".", ":");
  if (typeof value === "number" && value >= 0 && value < 1) {
    return formatMinutes(Math.round(value * 24 * 60) % (24 * 60)).replace(".", ":");
  }
  return String(value).trim().replace(".", ":");
}
