// Logo + nama aplikasi. Dipakai di halaman login dan header, jadi cukup
// diubah di satu tempat kalau nanti ada logo resmi.
//
// `compact`: di HP hanya logo yang tampil (header sempit), teks muncul mulai
// layar tablet.

import { WalletIcon } from "lucide-react";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Brand({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
        <WalletIcon className="size-4" />
      </div>
      <div className={cn("grid leading-tight", compact && "hidden sm:grid")}>
        <span className="font-semibold">{PRODUCT_NAME}</span>
        <span className="text-xs text-muted-foreground">{PRODUCT_TAGLINE}</span>
      </div>
    </div>
  );
}
