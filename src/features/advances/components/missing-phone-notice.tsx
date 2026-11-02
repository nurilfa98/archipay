// Info untuk user yang belum mengisi nomor WhatsApp: pengajuan uang muka
// (alur pull, permission advance:request) baru bisa dilakukan setelah nomor
// diisi, karena notifikasi persetujuan, pencairan, dan pengingat nota dikirim
// lewat WhatsApp. Tombol "Ajukan uang muka" disembunyikan dan diganti kartu ini.
//
// Dipakai di halaman Uang Muka (/advances) dan halaman form pengajuan
// (/advances/request, bila dibuka langsung lewat URL). Server Action
// createAdvance juga menolak pengajuan tanpa nomor WhatsApp.

import { ArrowRightIcon, MessageCircleWarningIcon } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function MissingPhoneNotice() {
  return (
    <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <MessageCircleWarningIcon />
      <AlertTitle>Lengkapi nomor WhatsApp untuk mengajukan uang muka</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>
          Status pengajuan, pencairan dana, dan pengingat unggah nota dikirim lewat WhatsApp. Isi nomor WhatsApp
          Anda di Profil, lalu kembali ke halaman ini.
        </p>
        <Button size="sm" nativeButton={false} render={<Link href="/profile" />}>
          Lengkapi profil
          <ArrowRightIcon />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
