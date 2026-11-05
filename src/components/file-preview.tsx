// Pratinjau file privat (foto nota, lampiran cuti, bukti bayar) mengambang di
// atas halaman, tanpa buka tab baru. Latar halaman digelapkan + diburamkan
// supaya fokus ke file; tombol X di pojok kanan atas. Tutup juga lewat Esc
// atau ketuk area di luar file.
//
// `src` adalah route berizin (mis. /api/receipts/<id>) yang mengecek hak akses
// di server. Foto tampil sebagai <img>; PDF di <iframe> plus tautan "Buka di
// tab baru" karena browser HP (terutama Android) sering tidak bisa menampilkan
// PDF di iframe. Kalau foto gagal dimuat, tampil pesan + tautan yang sama.

"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ExternalLinkIcon, Loader2Icon, XIcon } from "lucide-react";

const TRIGGER_CLASS =
  "inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-sm text-sm font-medium text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";

export function FilePreview({
  src,
  isPdf,
  title,
  className = TRIGGER_CLASS,
  children,
}: {
  src: string;
  isPdf: boolean;
  title: string; // untuk pembaca layar, mis. "Pratinjau nota"
  className?: string; // gaya tombol pembuka
  children: ReactNode; // isi tombol pembuka (ikon + teks)
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={className}>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          className={
            "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 " +
            (isPdf
              ? "flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden rounded-lg bg-background shadow-xl"
              : "")
          }
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {isPdf ? <PdfView src={src} title={title} /> : <ImageView src={src} title={title} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImageView({ src, title }: { src: string; title: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <div className="relative">
      {state === "loading" && (
        <div className="flex size-48 items-center justify-center rounded-lg bg-background/90">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {state === "error" && (
        <div className="flex w-72 max-w-[calc(100vw-2rem)] flex-col items-start gap-3 rounded-lg bg-background p-4 pr-14 shadow-xl">
          <p className="text-sm text-muted-foreground">File tidak bisa ditampilkan di sini.</p>
          <OpenInNewTab src={src} />
        </div>
      )}
      {state !== "error" && (
        // eslint-disable-next-line @next/next/no-img-element -- file privat lewat route berizin
        <img
          src={src}
          alt={title}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={
            "block max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-lg bg-background object-contain shadow-xl " +
            (state === "loaded" ? "" : "hidden")
          }
        />
      )}
      <CloseButton className="absolute top-2 right-2" />
    </div>
  );
}

function PdfView({ src, title }: { src: string; title: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <OpenInNewTab src={src} />
        <CloseButton />
      </div>
      <iframe src={src} title={title} className="min-h-0 w-full flex-1 bg-muted" />
    </>
  );
}

function OpenInNewTab({ src }: { src: string }) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
    >
      <ExternalLinkIcon className="size-4" />
      Buka di tab baru
    </a>
  );
}

function CloseButton({ className = "" }: { className?: string }) {
  return (
    <Dialog.Close
      aria-label="Tutup pratinjau"
      className={
        "inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white shadow-md outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white " +
        className
      }
    >
      <XIcon className="size-5" />
    </Dialog.Close>
  );
}
