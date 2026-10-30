// Saklar Aktif/Nonaktif kategori biaya di kolom Status (OWNER).
//
// - Mengaktifkan: langsung disimpan (tidak berisiko).
// - Menonaktifkan: minta konfirmasi dulu, karena kategori hilang dari form
//   nota baru.
// Saklar langsung berpindah saat diklik (useOptimistic); bila server menolak,
// kembali ke posisi semula dan pesan error tampil sebagai toast.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useId, useOptimistic, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { setExpenseCategoryActive } from "@/features/settings/actions";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export function CategoryActiveSwitch({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const labelId = useId();
  const [pending, startTransition] = useTransition();
  const [optimisticActive, setOptimisticActive] = useOptimistic(isActive);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function save(next: boolean) {
    startTransition(async () => {
      setOptimisticActive(next);
      const result = await setExpenseCategoryActive(id, next);
      if (result.success) {
        setConfirmOpen(false);
        notify.success(next ? `"${name}" diaktifkan.` : `"${name}" dinonaktifkan.`);
      } else {
        notify.error(result.message);
      }
    });
  }

  function handleChange(next: boolean) {
    if (next) save(true);
    else setConfirmOpen(true);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          checked={optimisticActive}
          onCheckedChange={handleChange}
          disabled={pending}
          aria-labelledby={labelId}
          className="data-checked:bg-emerald-600 dark:data-checked:bg-emerald-500"
        />
        <span
          id={labelId}
          className={cn("text-sm", optimisticActive ? "font-medium" : "text-muted-foreground")}
        >
          <span className="sr-only">Status {name}: </span>
          {optimisticActive ? "Aktif" : "Nonaktif"}
        </span>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Kategori tidak bisa dipilih lagi untuk nota baru. Nota lama tetap memakai kategori ini, dan kategori bisa
              diaktifkan lagi kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => save(false)}>
              {pending && <LoaderCircleIcon className="animate-spin" />}
              Nonaktifkan
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
