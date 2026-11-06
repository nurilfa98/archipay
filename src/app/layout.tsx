// Root layout: membungkus SELURUH halaman (login maupun halaman setelah login).
// Isinya hanya hal global: <html>, font, CSS, dan provider yang dipakai di mana-mana
// (tema terang/gelap, tooltip, toast).
// Layout khusus (header) ada di route group masing-masing:
// - src/app/(login)/login/page.tsx → halaman login (info + kartu form di PC)
// - src/app/(auth)/layout.tsx → ganti password & verifikasi nomor HP
// - src/app/(app)/layout.tsx  → halaman setelah login
//
// Referensi: node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClientErrorListener } from "@/features/error-logs/components/client-error-listener";
import { InstallAppListener } from "@/features/pwa/components/install-app-listener";
import { PRODUCT_DESCRIPTION } from "@/lib/brand";
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
  description: PRODUCT_DESCRIPTION,
  applicationName: "ArchiPay",
  // Untuk iPhone/iPad: saat dipasang lewat Share → "Tambahkan ke Layar Utama",
  // ArchiPay terbuka layar penuh dengan nama ini di bawah ikonnya.
  // Ikon iOS diambil dari src/app/apple-icon.png (otomatis oleh Next.js).
  appleWebApp: { capable: true, title: "ArchiPay", statusBarStyle: "default" },
};

// Warna status bar HP (dan bar judul saat dibuka sebagai aplikasi) mengikuti
// latar aplikasi: slate-50 di mode terang, slate-950 di mode gelap.
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
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
          {/* Dibutuhkan komponen yang memakai tooltip (misal tombol ikon) */}
          <TooltipProvider>{children}</TooltipProvider>
          {/* Toast hasil simpan data, tampil di pojok kanan bawah. Dipanggil lewat
              notify.* (src/lib/notify.ts). Diletakkan di root agar tetap tampil
              walau halaman berpindah. */}
          <Toaster />
          {/* Menangkap event "pasang aplikasi" dari browser sedini mungkin;
              tombolnya ada di halaman login dan menu user. */}
          <InstallAppListener />
          {/* Mencatat error browser yang lolos ke log error (Superadmin). */}
          <ClientErrorListener />
        </ThemeProvider>
      </body>
    </html>
  );
}
