// Warna project ditentukan oleh IKON-nya: setiap ikon punya satu warna tetap,
// jadi mengganti ikon otomatis mengganti warna kartu, border, dan pita project.
// Tidak perlu kolom tambahan di database.
//
// Hanya HUE (0-359, OKLCH) yang diatur di sini; kecerahan dan kepekatan
// diatur kelas .project-accent di globals.css (terang dan gelap), sehingga
// semua warna project terlihat selaras. Hue diberi jarak ±30° agar 12 warna
// mudah dibedakan, dan dipilih yang cocok dengan arti ikonnya.

import { DEFAULT_PROJECT_ICON, isProjectIcon, type ProjectIconKey } from "./constants";

export const PROJECT_ICON_HUES: Record<ProjectIconKey, number> = {
  landmark: 10, // merah marun
  home: 40, // terakota
  hammer: 65, // oranye
  "hard-hat": 90, // kuning helm proyek
  zap: 115, // lime (listrik)
  trees: 145, // hijau
  truck: 175, // teal
  warehouse: 205, // biru laut
  building: 250, // biru
  factory: 280, // indigo
  wrench: 310, // ungu
  store: 345, // merah muda
};

export function projectHue(icon: string): number {
  return PROJECT_ICON_HUES[isProjectIcon(icon) ? icon : DEFAULT_PROJECT_ICON];
}
