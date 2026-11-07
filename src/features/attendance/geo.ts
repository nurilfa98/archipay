// Koordinat & jarak untuk lokasi absensi. Fungsi murni, dipakai server dan
// client.

import type { AttendanceTimezone } from "./constants";

export type LatLng = { lat: number; lng: number };

// Perkiraan zona waktu dari koordinat (garis bujur), untuk mengisi zona waktu
// lokasi otomatis. Batas: WIB < 114,5°BT <= WITA < 127°BT <= WIT. Di dekat batas
// bisa meleset (mis. Kalimantan Tengah bagian timur seharusnya WIB, Pulau Wetar
// WIT), karena itu pengguna tetap bisa mengubahnya. null bila titik di luar
// Indonesia.
export function timezoneForPoint({ lat, lng }: LatLng): AttendanceTimezone | null {
  if (lat < -11.5 || lat > 6.5 || lng < 94 || lng > 141.5) return null;
  if (lng < 114.5) return "Asia/Jakarta";
  if (lng < 127) return "Asia/Makassar";
  return "Asia/Jayapura";
}

// Membaca koordinat dari teks yang ditempel pengguna:
// - "-6.27181, 106.71335"  (klik kanan di Google Maps → klik angka koordinat)
// - "-6.27181 106.71335"
// - link Google Maps berisi "@-6.27181,106.71335" atau "q=-6.27181,106.71335"
// Desimal wajib memakai titik. null bila tidak dikenali atau di luar jangkauan.
export function parseCoordinates(text: string): LatLng | null {
  const value = text.trim();
  if (!value) return null;

  const fromUrl =
    /@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/.exec(value) ??
    /[?&](?:q|ll|query|destination)=(-?\d{1,2}(?:\.\d+)?)(?:,|%2C)\s*(-?\d{1,3}(?:\.\d+)?)/i.exec(value);
  const plain = /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(value);
  const match = fromUrl ?? plain;
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: roundCoordinate(lat), lng: roundCoordinate(lng) };
}

// 6 desimal ≈ ketelitian 0,1 m, lebih dari cukup untuk GPS HP.
export function roundCoordinate(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

export function formatCoordinates({ lat, lng }: LatLng) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// Jarak dua titik di permukaan bumi (rumus haversine), dalam meter.
export function distanceMeters(a: LatLng, b: LatLng) {
  const earthRadius = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

// Link untuk membuka titik di aplikasi peta (Google Maps di HP).
export function mapLink({ lat, lng }: LatLng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
