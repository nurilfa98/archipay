// Satu bagian di halaman Pengaturan: penjelasan di kolom kiri (ikon, judul,
// deskripsi singkat, catatan), isian/form di kolom kanan. Di HP keduanya
// ditumpuk. Kolom penjelasan menempel saat bagian panjang di-scroll.
// Server Component (tanpa state).

import { InfoIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  hints,
  meta,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  // Catatan penting yang perlu diketahui sebelum mengubah isian.
  hints?: string[];
  // Keterangan kecil di bawah catatan, misal "Terakhir diubah ...".
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 rounded-2xl border bg-card">
      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <header className="flex flex-col gap-3 lg:sticky lg:top-32 lg:self-start">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand [&>svg]:size-5">
              <Icon />
            </span>
            <h2 className="text-base leading-snug font-semibold">{title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          {hints && hints.length > 0 && (
            <ul className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              {hints.map((hint) => (
                <li key={hint} className="flex items-start gap-2">
                  <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-brand" />
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
          )}
          {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
