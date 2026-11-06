// Peta lokasi absensi: Leaflet + OpenStreetMap (gratis, tanpa API key).
//
// - Setiap titik tampil sebagai pin (bisa digeser) + lingkaran radius.
// - Klik di peta memanggil `onMapClick` (form satu lokasi: pindahkan pin;
//   "tambah banyak": tambah baris baru).
// - `focus` berubah → peta pindah ke titik itu (hasil cari alamat / GPS).
// - `fitKey` berubah → peta diatur agar semua titik terlihat (setelah impor).
//   Saat pertama dibuka, peta juga menampilkan semua titik yang sudah ada.
//
// - `me` (opsional): posisi pengguna saat ini (titik biru + lingkaran akurasi
//   GPS), dipakai halaman absen. Peta menyesuaikan agar `me` dan semua titik
//   terlihat.
//
// Leaflet membaca `window` saat dimuat, jadi library-nya di-import di dalam
// useEffect (hanya di browser), bukan di bagian atas file. Objek peta
// disimpan di ref; props terbaru dibaca lewat ref agar peta tidak dibuat ulang.
//
// Aturan pakai tile OSM: wajib atribusi "© OpenStreetMap contributors" dan
// pemakaian wajar. Referensi: https://operations.osmfoundation.org/policies/tiles/

"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { LatLng } from "../geo";

export type MapPoint = LatLng & { radius: number; label?: string };

type Handlers = {
  onMapClick?: (point: LatLng) => void;
  onPointMove?: (index: number, point: LatLng) => void;
  onPointSelect?: (index: number) => void;
};

export type MapMe = LatLng & { accuracy: number };

type MapState = {
  L: typeof Leaflet;
  map: Leaflet.Map;
  layer: Leaflet.LayerGroup;
  meLayer: Leaflet.LayerGroup;
};

// Tengah Indonesia, bila belum ada titik sama sekali.
const INDONESIA: LatLng = { lat: -2.5, lng: 118 };

export function LocationMap({
  points,
  selectedIndex,
  focus,
  fitKey,
  me,
  ariaLabel,
  onMapClick,
  onPointMove,
  onPointSelect,
  className,
}: {
  points: MapPoint[];
  selectedIndex?: number | null;
  focus?: (LatLng & { zoom?: number; key: number }) | null;
  fitKey?: number;
  me?: MapMe | null;
  ariaLabel?: string;
  className?: string;
} & Handlers) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<MapState | null>(null);
  // Props terbaru, dibaca oleh peta tanpa membuat ulang peta.
  const latest = useRef({
    points,
    selectedIndex,
    me,
    handlers: { onMapClick, onPointMove, onPointSelect } as Handlers,
  });
  useEffect(() => {
    latest.current = {
      points,
      selectedIndex,
      me,
      handlers: { onMapClick, onPointMove, onPointSelect },
    };
  });

  // Buat peta sekali.
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      const container = containerRef.current;
      if (cancelled || !container || stateRef.current) return;
      const map = L.map(container, { zoomControl: true }).setView([INDONESIA.lat, INDONESIA.lng], 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      map.on("click", (event: Leaflet.LeafletMouseEvent) =>
        latest.current.handlers.onMapClick?.({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
        }),
      );
      const state = { L, map, layer: L.layerGroup().addTo(map), meLayer: L.layerGroup().addTo(map) };
      stateRef.current = state;
      drawPoints(state, latest.current.points, latest.current.selectedIndex, latest);
      drawMe(state, latest.current.me);
      if (latest.current.me) fitWithMe(state, latest.current.points, latest.current.me);
      else fitPoints(state, latest.current.points);
    });
    return () => {
      cancelled = true;
      stateRef.current?.map.remove();
      stateRef.current = null;
    };
  }, []);

  // Gambar ulang titik setiap data berubah.
  useEffect(() => {
    if (stateRef.current) drawPoints(stateRef.current, points, selectedIndex, latest);
  }, [points, selectedIndex]);

  // Posisi pengguna berubah (halaman absen): gambar ulang lalu tampilkan bersama titik lokasi.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    drawMe(state, me);
    if (me) fitWithMe(state, latest.current.points, me);
  }, [me]);

  // Atur peta agar semua titik terlihat (misal setelah impor file).
  useEffect(() => {
    if (fitKey && stateRef.current) fitPoints(stateRef.current, latest.current.points);
  }, [fitKey]);

  // Pindah ke titik fokus (hasil pencarian / GPS).
  useEffect(() => {
    if (focus && stateRef.current) stateRef.current.map.setView([focus.lat, focus.lng], focus.zoom ?? 17);
  }, [focus]);

  return (
    <div
      ref={containerRef}
      className={cn("z-0 h-80 w-full overflow-hidden rounded-lg border bg-muted sm:h-96", className)}
      role="application"
      aria-label={ariaLabel ?? "Peta lokasi. Klik peta untuk memilih titik, geser pin untuk memindahkannya."}
    />
  );
}

function drawPoints(
  { L, layer }: MapState,
  points: MapPoint[],
  selectedIndex: number | null | undefined,
  latest: { current: { handlers: Handlers } },
) {
  layer.clearLayers();
  points.forEach((point, index) => {
    const selected = selectedIndex === undefined || selectedIndex === null || selectedIndex === index;
    const color = selected ? "#4f46e5" : "#64748b";
    L.circle([point.lat, point.lng], {
      radius: point.radius,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: selected ? 0.15 : 0.08,
      interactive: false,
    }).addTo(layer);

    const marker = L.marker([point.lat, point.lng], {
      draggable: !!latest.current.handlers.onPointMove,
      icon: pinIcon(L, color, points.length > 1 ? String(index + 1) : ""),
      title: point.label || `Titik ${index + 1}`,
      keyboard: true,
    }).addTo(layer);
    marker.on("dragend", () => {
      const position = marker.getLatLng();
      latest.current.handlers.onPointMove?.(index, {
        lat: position.lat,
        lng: position.lng,
      });
    });
    marker.on("click", () => latest.current.handlers.onPointSelect?.(index));
    if (point.label) marker.bindTooltip(point.label, { direction: "top", offset: [0, -30] });
  });
}

function drawMe({ L, meLayer }: MapState, me: MapMe | null | undefined) {
  meLayer.clearLayers();
  if (!me) return;
  L.circle([me.lat, me.lng], {
    radius: me.accuracy,
    color: "#2563eb",
    weight: 1,
    fillColor: "#2563eb",
    fillOpacity: 0.1,
    interactive: false,
  }).addTo(meLayer);
  L.circleMarker([me.lat, me.lng], {
    radius: 8,
    color: "#fff",
    weight: 3,
    fillColor: "#2563eb",
    fillOpacity: 1,
  })
    .bindTooltip("Posisi Anda", { direction: "top" })
    .addTo(meLayer);
}

// Semua titik lokasi + posisi pengguna terlihat; zoom tidak lebih dekat dari 17.
function fitWithMe({ L, map }: MapState, points: MapPoint[], me: MapMe) {
  const all = [...points.map((point) => [point.lat, point.lng] as [number, number]), [me.lat, me.lng] as [number, number]];
  map.fitBounds(L.latLngBounds(all).pad(0.2), { maxZoom: 17 });
}

function fitPoints({ L, map }: MapState, points: MapPoint[]) {
  if (points.length === 0) return;
  if (points.length === 1) map.setView([points[0].lat, points[0].lng], 17);
  else map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number])).pad(0.2));
}

// Pin sederhana (div + CSS), tanpa file gambar: ikon bawaan Leaflet sering
// tidak ketemu setelah dibundel.
function pinIcon(L: typeof Leaflet, color: string, text: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font:600 12px system-ui">${text}</span></div>`,
  });
}
