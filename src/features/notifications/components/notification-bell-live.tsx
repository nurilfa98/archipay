// Bagian klien dari lonceng: memperbarui angka tanpa memuat ulang halaman.
// Layout tidak dirender ulang saat pindah halaman, jadi tanpa ini angka akan
// basi setelah pengguna menyelesaikan sebuah tugas.

"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchBellState, type BellState } from "../actions";
import { BellButton } from "./bell-button";

const REFRESH_MS = 90_000;

export function NotificationBellLive({ initial }: { initial: BellState }) {
  const pathname = usePathname();
  // Hasil terbaru dari browser, berlaku selama angka awal dari server belum berubah.
  const [fetched, setFetched] = useState<{ base: string; state: BellState } | null>(null);
  const initialKey = `${initial.count}:${initial.urgent}`;
  const first = useRef(true);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetchBellState()
        .then((state) => {
          if (active) setFetched({ base: initialKey, state });
        })
        .catch(() => undefined);

    // Muat pertama sudah dihitung server; mulai menyegarkan saat pindah halaman.
    if (first.current) first.current = false;
    else void refresh();

    const timer = setInterval(refresh, REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname, initialKey]);

  const shown = fetched && fetched.base === initialKey ? fetched.state : initial;
  return <BellButton count={shown.count} urgent={shown.urgent} />;
}
