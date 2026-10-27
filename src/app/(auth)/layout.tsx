// Layout untuk halaman akun tanpa sidebar/navbar (route group "(auth)"):
// login dan ganti password. Konten di tengah layar.
//
// min-h-svh = tinggi layar "small viewport". Di HP, ini tidak tertutup
// address bar browser (berbeda dengan 100vh).
//
// Referensi: node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md
// (bagian "Route groups" → "Opting specific segments into a layout")

import { Brand } from "@/components/layout/brand";
import { COMPANY_NAME, COPYRIGHT_YEAR } from "@/lib/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-4 sm:p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Brand className="self-center" />
        {children}
        <p className="text-center text-xs text-muted-foreground">
          © {COPYRIGHT_YEAR} {COMPANY_NAME}.
        </p>
      </div>
    </div>
  );
}
