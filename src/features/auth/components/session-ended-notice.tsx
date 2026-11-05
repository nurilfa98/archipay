// Pesan di halaman login saat DAL mengirim pengguna kembali dengan
// /login?reason=ended: cookie-nya masih ada tetapi sesinya sudah tidak berlaku
// (dikeluarkan dari perangkat lain, password diubah/di-reset, atau akun
// dinonaktifkan). Server Component: tanpa JavaScript tambahan di browser.

import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export async function SessionEndedNotice({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { reason } = await searchParams;
  if ((Array.isArray(reason) ? reason[0] : reason) !== "ended") return null;
  return (
    <Alert>
      <InfoIcon />
      <AlertDescription>
        Sesi Anda berakhir. Perangkat ini dikeluarkan dari perangkat lain, atau password diubah. Silakan masuk lagi.
      </AlertDescription>
    </Alert>
  );
}
