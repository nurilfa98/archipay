// Pencocokan wajah di SERVER: membandingkan embedding selfie absen dengan
// embedding foto acuan yang sudah disetujui. Ambangnya ada di Pengaturan
// platform (faceMatchThreshold), sehingga tidak bisa diubah dari HP.
//
// Rumusnya disalin dari @vladmandic/human (src/face/match.ts, fungsi
// similarity dengan opsi bawaan order 2, multiplier 25, min 0.2, max 0.8),
// agar skornya sama dengan yang dipakai library: di atas 0,5 = cocok.
// Wajib diperiksa ulang bila versi library diganti (FACE_MODEL_VERSION).

import "server-only";

const ORDER = 2;
const MULTIPLIER = 25;
const MIN = 0.2;
const MAX = 0.8;

// 0–100 (similarity × 100, dibulatkan).
export function faceSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  const distance = Math.round(100 * MULTIPLIER * sum) / 100;
  if (distance === 0) return 100;
  const root = ORDER === 2 ? Math.sqrt(distance) : distance ** (1 / ORDER);
  const normalized = (1 - root / 100 - MIN) / (MAX - MIN);
  return Math.round(100 * Math.max(Math.min(normalized, 1), 0));
}
