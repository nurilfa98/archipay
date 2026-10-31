// Tombol "Nonaktifkan / Aktifkan company" di halaman detail company. Berdampak
// ke semua pengguna company itu, jadi selalu meminta konfirmasi.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useState, useTransition } from "react";
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
import { setCompanyActive } from "@/features/companies/actions";
import { notify } from "@/lib/notify";

export function CompanyStatusAction({ company }: { company: { id: string; name: string; isActive: boolean } }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await setCompanyActive(company.id, !company.isActive);
      if (!result.success) notify.error(result.message);
      else notify.success(company.isActive ? "Company dinonaktifkan." : "Company diaktifkan kembali.");
      setOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{company.isActive ? "Nonaktifkan company" : "Aktifkan company"}</p>
        <p className="text-sm text-muted-foreground">
          {company.isActive
            ? "Semua pengguna company ini tidak bisa login, dan sesi yang sedang berjalan langsung berhenti. Data tetap tersimpan."
            : "Pengguna company ini bisa login kembali."}
        </p>
      </div>
      <Button
        variant={company.isActive ? "destructive" : "outline"}
        className="shrink-0"
        onClick={() => setOpen(true)}
      >
        {company.isActive ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {company.isActive ? `Nonaktifkan ${company.name}?` : `Aktifkan ${company.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {company.isActive
                ? "Semua pengguna company ini langsung tidak bisa memakai aplikasi. Anda bisa mengaktifkannya kembali kapan saja."
                : "Pengguna company ini bisa login kembali."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button variant={company.isActive ? "destructive" : "brand"} disabled={pending} onClick={handleConfirm}>
              {pending && <LoaderCircleIcon className="animate-spin" />}
              {company.isActive ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
