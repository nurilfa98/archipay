// Tombol salin ke clipboard (nomor rekening, dll). Ikon berubah jadi centang
// selama 2 detik dan muncul toast, supaya jelas sudah tersalin.
//
// Clipboard API hanya tersedia di HTTPS/localhost dan bisa ditolak browser;
// cadangannya textarea sementara + document.execCommand("copy"), yang masih
// jalan di WebView/browser lama (termasuk browser dalam aplikasi WhatsApp).
//
// Referensi: https://developer.mozilla.org/docs/Web/API/Clipboard/writeText

"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // lanjut ke cadangan
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  value,
  label = "Salin",
  successMessage = "Tersalin.",
  className,
}: {
  value: string; // teks yang disalin persis seperti ini
  label?: string; // aria-label & tooltip, mis. "Salin nomor rekening BCA"
  successMessage?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleClick() {
    if (!(await copyText(value))) {
      notify.error("Tidak bisa menyalin otomatis. Salin manual.");
      return;
    }
    notify.success(successMessage);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={handleClick}
      className={cn("shrink-0 text-muted-foreground", copied && "text-emerald-600 dark:text-emerald-400", className)}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
