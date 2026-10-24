// Hook dari shadcn (dipakai komponen Sidebar) untuk mendeteksi layar HP.
//
// Versi bawaan shadcn memanggil setState di dalam useEffect, yang ditolak
// aturan lint React 19 (react-hooks/set-state-in-effect). Versi ini memakai
// useSyncExternalStore, cara resmi React untuk "berlangganan" ke sumber data
// di luar React, seperti ukuran layar browser.
//
// Referensi: https://react.dev/reference/react/useSyncExternalStore

import * as React from "react"

const MOBILE_BREAKPOINT = 768
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(query)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Saat render di server belum ada ukuran layar; anggap desktop.
    () => false
  )
}
