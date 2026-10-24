// Root layout: membungkus SELURUH halaman (login maupun halaman setelah login).
// Isinya hanya hal global: <html>, font, CSS, dan provider yang dipakai di mana-mana.
// Layout khusus (sidebar, navbar) ada di route group masing-masing:
// - src/app/(auth)/layout.tsx → halaman login
// - src/app/(app)/layout.tsx  → halaman setelah login
//
// Referensi: node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Dibutuhkan tooltip menu sidebar saat sidebar diciutkan (mode ikon) */}
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
