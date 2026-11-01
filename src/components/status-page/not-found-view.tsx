// Isi halaman "Halaman tidak ditemukan" (404), dipakai app/not-found.tsx
// (URL yang tidak dikenal) dan app/(app)/not-found.tsx (notFound() di halaman
// setelah login, header aplikasi tetap tampil). Tanpa tombol lapor: 404
// biasanya karena link lama atau salah ketik, bukan kerusakan sistem.

import { HouseIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NotFoundIllustration } from "./status-illustrations";
import { StatusPage } from "./status-page";

export function NotFoundView({ standalone = false }: { standalone?: boolean }) {
  return (
    <StatusPage
      standalone={standalone}
      illustration={<NotFoundIllustration />}
      label="404"
      title="Halaman tidak ditemukan"
      description="Halaman yang Anda cari tidak ada, sudah dipindahkan, atau Anda tidak memiliki akses ke data tersebut. Periksa kembali alamatnya."
    >
      <Button nativeButton={false} render={<Link href="/" />}>
        <HouseIcon />
        Ke beranda
      </Button>
    </StatusPage>
  );
}
