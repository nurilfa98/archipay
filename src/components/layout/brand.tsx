// Logo + nama aplikasi. Dipakai di halaman login dan header. Gambar logonya
// ada di logo-mark.tsx (sama dengan ikon aplikasi di layar HP).
//
// `compact`: di HP hanya logo yang tampil (header sempit), teks muncul mulai
// layar tablet.

import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";

export function Brand({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark className="size-8" />
      <div className={cn("grid leading-tight", compact && "hidden sm:grid")}>
        <span className="font-semibold">{PRODUCT_NAME}</span>
        <span className="text-xs text-muted-foreground">{PRODUCT_TAGLINE}</span>
      </div>
    </div>
  );
}
