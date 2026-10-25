// Tombol "Ekspor Excel" di halaman Potong Gaji. File diambil lewat fetch (bukan
// link biasa) agar bila daftar "Belum dipotong" kosong, yang muncul toast
// penjelasan, bukan file Excel berisi judul kolom saja. Server yang menentukan
// kosong/tidaknya (status 409), sehingga tetap akurat walau halaman belum
// dimuat ulang.

"use client";

import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

const EXPORT_URL = "/api/payroll-deductions/export";

export function PayrollExportButton() {
  const [pending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      try {
        const response = await fetch(EXPORT_URL, { cache: "no-store" });
        if (response.status === 409) {
          notify.warning("Belum ada sisa uang muka yang perlu dipotong dari gaji.", {
            title: "Belum ada data untuk diekspor",
          });
          return;
        }
        if (!response.ok) {
          notify.error("File Excel gagal dibuat. Muat ulang halaman, lalu coba lagi.");
          return;
        }
        downloadBlob(await response.blob(), filenameOf(response) ?? "potong-gaji.xlsx");
      } catch {
        notify.error("File Excel gagal diunduh. Periksa koneksi internet Anda, lalu coba lagi.");
      }
    });
  }

  return (
    <Button variant="brand" disabled={pending} onClick={handleExport}>
      {pending ? <LoaderCircleIcon className="animate-spin" /> : <DownloadIcon />}
      Ekspor Excel
    </Button>
  );
}

// Nama file dari header Content-Disposition, misal "potong-gaji-2026-10-25.xlsx".
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
