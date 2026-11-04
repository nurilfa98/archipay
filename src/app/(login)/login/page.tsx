// Halaman /login. Folder (login) adalah route group: tanda kurung membuat nama
// folder tidak masuk ke URL. Login sengaja dipisah dari (auth) karena
// tampilannya berbeda dari halaman ganti password / verifikasi HP:
// - PC (≥1024px): seluruh layar berlatar indigo (LoginBackdrop), info produk di
//   kiri (LoginShowcase), form dalam kartu putih melayang di kanan.
// - HP/tablet: hanya logo besar + form (cocok untuk PWA).
//
// page.tsx sengaja dibuat tipis: hanya menyusun komponen dari features/auth.
//
// min-h-svh = tinggi layar "small viewport". Di HP, ini tidak tertutup
// address bar browser (berbeda dengan 100vh).
//
// Referensi: node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md
// (bagian "Route groups")

import type { Metadata } from "next";
import { LogoMark } from "@/components/layout/logo-mark";
import { LoginForm } from "@/features/auth/components/login-form";
import { LoginBackdrop, LoginShowcase } from "@/features/auth/components/login-showcase";
import { InstallAppButton } from "@/features/pwa/components/install-app-button";
import { COMPANY_NAME, COPYRIGHT_YEAR, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Masuk",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-svh bg-background lg:items-center lg:overflow-hidden lg:bg-linear-to-br lg:from-indigo-600 lg:via-indigo-800 lg:to-indigo-950">
      <LoginBackdrop />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16 lg:px-12 lg:py-20 xl:gap-24">
        <LoginShowcase />

        {/* HP: form memenuhi layar. PC: kartu putih melayang dengan bayangan. */}
        <main className="flex flex-1 flex-col items-center justify-center p-6 md:p-10 lg:rounded-2xl lg:bg-card lg:shadow-2xl lg:ring-1 lg:shadow-indigo-950/50 lg:ring-white/10">
          <div className="flex w-full max-w-sm flex-col gap-8">
            {/* Logo versi HP, dibuat besar (bertumpuk) agar tidak kalah dari tombol Masuk.
                Di PC logo sudah ada di sebelah kiri. */}
            <div className="flex flex-col items-center gap-3 text-center lg:hidden">
              <LogoMark className="size-20 rounded-[22%] shadow-lg shadow-indigo-500/25" />
              <div className="grid gap-1">
                <span className="text-3xl font-bold tracking-tight">{PRODUCT_NAME}</span>
                <span className="text-sm font-medium text-muted-foreground">{PRODUCT_TAGLINE}</span>
              </div>
            </div>

            {/* Judul hanya di PC; di HP logo besar di atas sudah cukup sebagai pembuka. */}
            <div className="hidden gap-1.5 lg:grid">
              <h2 className="text-2xl font-semibold tracking-tight">Selamat datang</h2>
              <p className="text-sm text-muted-foreground">Masuk dengan email dan password yang diberikan admin.</p>
            </div>

            <LoginForm />

            <div className="flex flex-col gap-6">
              <p className="text-center text-xs text-muted-foreground lg:text-left">
                Lupa password atau belum punya akun? Hubungi Owner.
              </p>
              {/* Hanya tampil di HP yang belum memasang ArchiPay ke layar utama. */}
              <InstallAppButton />
              {/* Di PC copyright ada di bawah layar (LoginBackdrop). */}
              <p className="text-center text-xs text-muted-foreground lg:hidden">
                © {COPYRIGHT_YEAR} {COMPANY_NAME}.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
