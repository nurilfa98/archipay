// Menjalankan `onResult` (toast, pindah halaman, dll.) SEKALI untuk setiap
// hasil Server Action yang baru dari useActionState.
//
// Kenapa tidak cukup useEffect(() => ..., [state])? Dengan cacheComponents,
// Next.js menyimpan halaman yang ditinggalkan secara tersembunyi (React
// <Activity>). Saat halaman itu dibuka lagi, semua effect dijalankan ulang,
// sementara `state` masih berisi hasil simpan terakhir: toast "tersimpan"
// muncul lagi setiap kali kembali ke halaman. Ref di sini mengingat hasil
// yang sudah ditangani (ref ikut tersimpan bersama halaman), sehingga hasil
// lama dilewati.
//
// Referensi:
// - https://react.dev/reference/react/useActionState
// - https://react.dev/reference/react/Activity

"use client";

import { useEffect, useRef } from "react";
import type { ActionResult } from "@/types/action-result";

export function useActionResult<T>(
  state: ActionResult<T> | undefined,
  onResult: (state: ActionResult<T>) => void,
) {
  const handled = useRef(state);
  const callback = useRef(onResult);

  // Selalu memakai callback terbaru tanpa membuat effect di bawah berjalan ulang.
  useEffect(() => {
    callback.current = onResult;
  });

  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    callback.current(state);
  }, [state]);
}
