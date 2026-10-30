// Tombol "Unduh PDF" laporan satu project di Beranda Owner. File diambil lewat
// fetch (bukan link biasa) agar bila gagal yang muncul toast, bukan berkas
// error yang ikut terunduh. Server (GET /api/projects/<id>/report) yang
// menentukan hak akses.

"use client";

import { FileDownIcon, LoaderCircleIcon } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

export function ProjectReportButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [pending, startTransition] = useTransition();

  function handleDownload() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/report`, { cache: "no-store" });
        if (response.status === 404) {
          notify.warning("Project tidak ditemukan. Muat ulang halaman, lalu coba lagi.");
          return;
        }
        if (!response.ok) {
          notify.error("Laporan PDF gagal dibuat. Muat ulang halaman, lalu coba lagi.");
          return;
        }
        downloadBlob(await response.blob(), filenameOf(response) ?? "laporan-project.pdf");
      } catch {
        notify.error("Laporan PDF gagal diunduh. Periksa koneksi internet Anda, lalu coba lagi.");
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleDownload}
      aria-label={`Unduh laporan PDF ${projectName}`}
    >
      {pending ? <LoaderCircleIcon className="animate-spin" /> : <FileDownIcon />}
      PDF
    </Button>
  );
}

// Nama file dari header Content-Disposition.
function filenameOf(response: Response) {
  return response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Dilepas setelah browser mulai mengunduh.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
