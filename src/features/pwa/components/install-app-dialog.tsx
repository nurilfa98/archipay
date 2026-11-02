// Dialog petunjuk memasang ArchiPay ke layar utama HP, untuk browser yang
// tidak punya dialog pasang otomatis:
// - iPhone/iPad: lewat tombol Bagikan → "Tambahkan ke Layar Utama".
// - Android selain Chrome/Edge/Samsung (misal Firefox): lewat menu ⋮.
//
// Dialog dikendalikan dari luar (open/onOpenChange) karena pemicunya bisa
// berada di dalam dropdown yang langsung tertutup setelah item diklik.

"use client";

import { EllipsisVerticalIcon, ShareIcon, SquarePlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/logo-mark";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  platform: "ios" | "manual";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InstallAppDialog({ platform, open, onOpenChange }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-transparent">
            <LogoMark className="size-10" />
          </AlertDialogMedia>
          <AlertDialogTitle>Pasang ArchiPay di HP</AlertDialogTitle>
          <AlertDialogDescription>
            Ikon ArchiPay akan muncul di layar utama, jadi Anda tidak perlu mengetik alamat web lagi.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ol className="flex flex-col gap-3 text-sm">
          {platform === "ios" ? (
            <>
              <Step number={1}>
                Ketuk tombol <b>Bagikan</b> <ShareIcon className="inline size-4 align-text-bottom" /> (di Safari ada di
                bar bawah).
              </Step>
              <Step number={2}>
                Gulir ke bawah, lalu pilih <b>Tambahkan ke Layar Utama</b>{" "}
                <SquarePlusIcon className="inline size-4 align-text-bottom" />.
              </Step>
              <Step number={3}>
                Ketuk <b>Tambah</b> di pojok kanan atas.
              </Step>
            </>
          ) : (
            <>
              <Step number={1}>
                Ketuk tombol menu browser <EllipsisVerticalIcon className="inline size-4 align-text-bottom" /> di pojok
                kanan atas.
              </Step>
              <Step number={2}>
                Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.
              </Step>
              <Step number={3}>
                Ketuk <b>Instal</b> / <b>Tambah</b> untuk konfirmasi.
              </Step>
            </>
          )}
        </ol>

        <AlertDialogFooter>
          <AlertDialogCancel>Mengerti</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
        {number}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
