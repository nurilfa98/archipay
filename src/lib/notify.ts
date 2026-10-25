// Helper toast untuk hasil simpan data di semua flow. Bungkus tipis di atas
// `toast.add()` (Base UI Toast dari shadcn) agar pemanggilannya seragam:
//
//   notify.success("Pengaturan tersimpan.");
//   notify.error(result.message);
//   notify.warning("Email gagal dikirim", { title: "Pengguna dibuat", action: { label: "Lihat detail", onClick } });
//
// <Toaster /> dipasang di src/app/layout.tsx (pojok kanan bawah). Hanya boleh
// dipanggil dari Client Component.
//
// Referensi:
// - https://ui.shadcn.com/docs/components/base/toast
// - https://base-ui.com/react/components/toast

import { toast } from "@/components/ui/toast";

type NotifyType = "success" | "error" | "warning" | "info";

type NotifyOptions = {
  title?: string;
  // Tombol di dalam toast, misal "Lihat detail".
  action?: { label: string; onClick: () => void };
  // Lama tampil dalam milidetik (bawaan Base UI 5000).
  timeout?: number;
};

function show(type: NotifyType, description: string, options: NotifyOptions = {}) {
  const { title, action, timeout } = options;
  return toast.add({
    type,
    title,
    description,
    timeout,
    // Error dibacakan screen reader seketika (aria-live assertive).
    priority: type === "error" ? "high" : "low",
    actionProps: action ? { children: action.label, onClick: action.onClick } : undefined,
  });
}

export const notify = {
  success: (description: string, options?: NotifyOptions) => show("success", description, options),
  error: (description: string, options?: NotifyOptions) => show("error", description, options),
  warning: (description: string, options?: NotifyOptions) => show("warning", description, options),
  info: (description: string, options?: NotifyOptions) => show("info", description, options),
};
