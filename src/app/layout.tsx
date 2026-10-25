// Root layout: membungkus SELURUH halaman (login maupun halaman setelah login).
// Isinya hanya hal global: <html>, font, CSS, dan provider yang dipakai di mana-mana
// (tema terang/gelap, tooltip).
// Layout khusus (sidebar, navbar) ada di route group masing-masing:
// - src/app/(auth)/layout.tsx → halaman login
// - src/app/(app)/layout.tsx  → halaman setelah login
//
// Referensi: node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// globals.css (dari shadcn) memakai variabel --font-sans, jadi nama
// variabel font di sini harus sama.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Halaman cukup menulis `title: "Masuk"`, hasilnya "Masuk | ArchiPay".
  title: { default: "ArchiPay", template: "%s | ArchiPay" },
  description: "Project Financial Control & Petty Cash Management System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes memasang class "dark" di <html>
    // sebelum React berjalan, jadi class-nya memang berbeda dengan hasil server.
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {/* Dibutuhkan tooltip menu sidebar saat sidebar diciutkan (mode ikon) */}
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
