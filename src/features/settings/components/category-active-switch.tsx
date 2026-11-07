// Saklar Aktif/Nonaktif kategori biaya di kolom Status (OWNER).
//
// Langsung disimpan saat diklik, tanpa dialog konfirmasi (sama dengan saklar
// Jenis cuti & izin): kategori nonaktif hanya hilang dari form nota baru, nota
// lama tetap utuh, dan bisa diaktifkan lagi kapan saja.
// Saklar langsung berpindah saat diklik (useOptimistic); bila server menolak,
// kembali ke posisi semula dan pesan error tampil sebagai toast.
// readOnly (superadmin): saklar hanya menampilkan status, tidak bisa diklik.

"use client";

import { useId, useOptimistic, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setExpenseCategoryActive } from "@/features/settings/actions";
import { notify } from "@/lib/notify";

export function CategoryActiveSwitch({
  id,
  name,
  isActive,
  readOnly = false,
}: {
  id: string;
  name: string;
  isActive: boolean;
  readOnly?: boolean;
}) {
  const labelId = useId();
  const [pending, startTransition] = useTransition();
  const [optimisticActive, setOptimisticActive] = useOptimistic(isActive);

  function handleChange(next: boolean) {
    startTransition(async () => {
      setOptimisticActive(next);
      const result = await setExpenseCategoryActive(id, next);
      if (result.success) {
        notify.success(next ? `"${name}" diaktifkan.` : `"${name}" dinonaktifkan.`);
      } else {
        notify.error(result.message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={optimisticActive}
        onCheckedChange={handleChange}
        disabled={pending || readOnly}
        aria-labelledby={labelId}
        className="data-checked:bg-emerald-600 dark:data-checked:bg-emerald-500"
      />
      <span id={labelId} className="text-xs text-muted-foreground">
        <span className="sr-only">Status {name}: </span>
        {optimisticActive ? "Aktif" : "Nonaktif"}
      </span>
    </div>
  );
}
