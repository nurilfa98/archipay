// Mode fokus halaman Langganan: setelah Owner memilih paket (langkah bayar),
// judul halaman, kartu Status, dan bagian lain disembunyikan supaya yang
// tampil hanya "Pilih paket" + panel pembayaran. PlanPicker menyalakan /
// mematikannya; bagian lain dibungkus <HideWhilePlanFocused>.

"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const PlanFocusContext = createContext<{ focused: boolean; setFocused: (focused: boolean) => void }>({
  focused: false,
  setFocused: () => {},
});

export function PlanFocusProvider({ children }: { children: ReactNode }) {
  const [focused, setFocused] = useState(false);
  return <PlanFocusContext value={{ focused, setFocused }}>{children}</PlanFocusContext>;
}

export function usePlanFocus() {
  return useContext(PlanFocusContext);
}

export function HideWhilePlanFocused({ children }: { children: ReactNode }) {
  const { focused } = usePlanFocus();
  return focused ? null : children;
}
