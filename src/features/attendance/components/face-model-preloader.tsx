// Memuat model pengenal wajah diam-diam saat halaman Absensi terbuka, supaya saat
// tombol "Absen masuk/pulang" ditekan model sudah siap (tidak menunggu unduhan).
//
// Hanya dijalankan saat browser sedang senggang dan koneksi tidak sedang hemat data /
// sangat lambat, supaya tidak membebani HP atau kuota yang tidak perlu. Gagal memuat
// tidak apa-apa: SelfieCamera memuatnya lagi saat kamera dibuka.

"use client";

import { useEffect } from "react";
import { preloadFaceModel } from "./face-capture";

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

export function FaceModelPreloader() {
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;

    const run = () => preloadFaceModel().catch(() => undefined);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(run, 2000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
