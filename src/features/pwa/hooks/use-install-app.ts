// Status "Pasang aplikasi" (PWA): apakah ArchiPay bisa/perlu dipasang ke
// layar utama HP, dan dengan cara apa.
//
//   mode     | kapan                                         | aksi tombol
//   ---------|-----------------------------------------------|---------------------------
//   hidden   | sudah dibuka sebagai aplikasi / sudah dipasang | tombol disembunyikan
//            | / desktop tanpa dukungan pasang               |
//   native   | browser memberi event `beforeinstallprompt`    | munculkan dialog pasang
//            | (Chrome, Edge, Samsung Internet di Android)    | bawaan browser
//   ios      | iPhone/iPad (tidak ada dialog pasang otomatis) | tampilkan petunjuk Share →
//            |                                               | "Tambahkan ke Layar Utama"
//   manual   | Android tanpa event (misal Firefox)            | tampilkan petunjuk menu ⋮
//
// Event `beforeinstallprompt` hanya dikirim sekali per halaman dan bisa datang
// sebelum komponen tombol tampil (misal menu user yang menunggu Suspense).
// Karena itu listener dipasang di level modul, dan modul ini sudah dimuat sejak
// awal lewat <InstallAppListener /> di root layout.
//
// Memakai useSyncExternalStore (lihat juga src/hooks/use-mobile.ts): di server
// mode selalu "hidden", sehingga tidak ada hydration mismatch.
//
// Referensi:
// - https://developer.mozilla.org/docs/Web/API/BeforeInstallPromptEvent
// - https://react.dev/reference/react/useSyncExternalStore

"use client";

import { useSyncExternalStore } from "react";

export type InstallMode = "hidden" | "native" | "ios" | "manual";

// Belum ada di lib DOM TypeScript (API non-standar Chromium).
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

const STANDALONE_QUERY = "(display-mode: standalone)";

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Cegah mini-infobar bawaan Chrome; dialog dimunculkan dari tombol kita.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

function isStandalone() {
  // navigator.standalone: versi lama Safari iOS.
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): "ios" | "android" | "other" {
  const ua = navigator.userAgent;
  // iPadOS 13+ mengaku "Macintosh"; bedanya ada layar sentuh.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function getSnapshot(): InstallMode {
  if (installed || isStandalone()) return "hidden";
  if (deferredPrompt) return "native";
  const platform = detectPlatform();
  if (platform === "ios") return "ios";
  if (platform === "android") return "manual";
  return "hidden";
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mql = window.matchMedia(STANDALONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    mql.removeEventListener("change", onChange);
  };
}

export function useInstallApp() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => "hidden" as const);

  // Munculkan dialog pasang bawaan browser. Event hanya bisa dipakai sekali;
  // kalau user menolak, browser akan mengirim event baru di kunjungan berikutnya.
  async function promptInstall() {
    const event = deferredPrompt;
    if (!event) return;
    deferredPrompt = null;
    await event.prompt();
    await event.userChoice;
    emit();
  }

  return { mode, promptInstall };
}
