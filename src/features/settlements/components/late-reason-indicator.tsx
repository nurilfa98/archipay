// Tanda seru kuning di samping nomor pertanggungjawaban, untuk laporan yang
// dikirim melewati batas unggah nota. Arahkan kursor (atau tekan) untuk melihat
// alasan keterlambatan yang ditulis karyawan saat mengirim.
//
// Dipakai di daftar pertanggungjawaban dan di header halaman detail. Tidak punya
// state, jadi bisa dipakai di Client maupun Server Component.

import { CircleAlertIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function LateReasonIndicator({ reason }: { reason: string | null }) {
  if (!reason) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`Terlambat: ${reason}`}
            className="inline-flex shrink-0 cursor-help items-center rounded-full text-amber-500 hover:text-amber-600 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:text-amber-400"
          />
        }
      >
        <CircleAlertIcon className="size-4" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <span className="block text-xs font-medium">Alasan keterlambatan</span>
        <span className="block whitespace-pre-line">{reason}</span>
      </TooltipContent>
    </Tooltip>
  );
}
