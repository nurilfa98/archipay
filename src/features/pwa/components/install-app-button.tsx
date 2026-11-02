// Tombol "Pasang ArchiPay di HP" di halaman login. Hanya tampil di HP yang
// belum membuka ArchiPay sebagai aplikasi (lihat tabel mode di use-install-app.ts).
// - Chrome/Edge/Samsung Android: langsung memunculkan dialog pasang bawaan browser.
// - iPhone & browser lain: menampilkan petunjuk langkah demi langkah.

"use client";

import { SmartphoneIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useInstallApp } from "../hooks/use-install-app";
import { InstallAppDialog } from "./install-app-dialog";

export function InstallAppButton() {
  const { mode, promptInstall } = useInstallApp();
  const [guideOpen, setGuideOpen] = useState(false);

  if (mode === "hidden") return null;

  return (
    <>
      <Button
        variant="outline"
        className="self-center"
        onClick={() => (mode === "native" ? promptInstall() : setGuideOpen(true))}
      >
        <SmartphoneIcon />
        Pasang ArchiPay di HP
      </Button>
      {mode !== "native" && <InstallAppDialog platform={mode} open={guideOpen} onOpenChange={setGuideOpen} />}
    </>
  );
}
