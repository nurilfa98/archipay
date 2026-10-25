// Tema terang/gelap/sistem memakai next-themes.
//
// - attribute="class": next-themes menambah class "dark" di <html>, sesuai
//   @custom-variant dark di globals.css dan variabel .dark milik shadcn.
// - defaultTheme="system" + enableSystem: awalnya mengikuti pengaturan
//   perangkat; pilihan user disimpan di localStorage browser.
// - disableTransitionOnChange: warna langsung berganti tanpa animasi
//   transisi yang "berkedip" saat tema diganti.
//
// Referensi:
// - https://ui.shadcn.com/docs/dark-mode/next
// - https://github.com/pacocoursey/next-themes

"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    />
  );
}
