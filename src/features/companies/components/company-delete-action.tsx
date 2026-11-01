// Tombol "Hapus company" di halaman detail company (khusus Superadmin).
// Menghapus company beserta SEMUA datanya secara permanen, jadi dialog
// konfirmasi meminta nama company diketik ulang (dicek lagi di server).
// Berhasil → server mengarahkan ke daftar company.

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCompany } from "@/features/companies/actions";
import { notify } from "@/lib/notify";

export function CompanyDeleteAction({ company }: { company: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [pending, startTransition] = useTransition();
  const matches = confirmName.trim() === company.name;

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) setConfirmName("");
  }

  function handleConfirm() {
    startTransition(async () => {
      // Berhasil: server redirect ke /companies, baris di bawah tidak dijalankan.
      const result = await deleteCompany(company.id, confirmName);
      if (!result.success) notify.error(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">Hapus company</p>
        <p className="text-sm text-muted-foreground">
          Company ini beserta semua datanya (pengguna, project, uang muka, pertanggungjawaban, file nota, potong gaji,
          tagihan langganan, audit log) dihapus permanen dan tidak bisa dikembalikan.
        </p>
      </div>
      <Button variant="destructive" className="shrink-0" onClick={() => setOpen(true)}>
        Hapus company
      </Button>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {company.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua data company ini dihapus permanen, termasuk akun penggunanya. Tindakan ini tidak bisa dibatalkan.
              Bila hanya ingin menghentikan akses, pilih Nonaktifkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-company-name">
              Ketik <span className="font-semibold">{company.name}</span> untuk mengonfirmasi
            </Label>
            <Input
              id="confirm-company-name"
              value={confirmName}
              autoComplete="off"
              disabled={pending}
              onChange={(event) => setConfirmName(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button variant="destructive" disabled={!matches || pending} onClick={handleConfirm}>
              {pending && <LoaderCircleIcon className="animate-spin" />}
              Hapus permanen
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
