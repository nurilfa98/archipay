// Logo + nama aplikasi. Dipakai di halaman login dan header sidebar,
// jadi cukup diubah di satu tempat kalau nanti ada logo resmi.

import { WalletIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <WalletIcon className="size-4" />
      </div>
      {/* Teks otomatis tersembunyi saat sidebar diciutkan ke mode ikon */}
      <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
        <span className="font-semibold">ArchiPay</span>
        <span className="text-xs text-muted-foreground">Petty Cash Management</span>
      </div>
    </div>
  );
}
