// Tampilan lonceng (tombol + angka), tanpa data: dipakai Server Component
// (angka awal / tampilan sementara) dan bagian klien yang menyegarkan angkanya.

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BellButton({ count, urgent }: { count: number; urgent: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={count > 0 ? `Pemberitahuan, ${count} perlu dilihat` : "Pemberitahuan"}
      title="Pemberitahuan"
      nativeButton={false}
      render={<Link href="/notifications" />}
    >
      <BellIcon />
      {count > 0 && (
        <span
          className={cn(
            "absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white tabular-nums",
            urgent ? "bg-rose-600" : "bg-brand",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Button>
  );
}
