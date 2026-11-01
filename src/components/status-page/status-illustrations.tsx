// Ilustrasi halaman error & tidak ditemukan. Digambar langsung sebagai SVG
// (tanpa file gambar) dan diwarnai lewat token tema (brand, card, border,
// muted), sehingga otomatis menyesuaikan mode gelap.
//
// aria-hidden: gambar hanya hiasan; maknanya sudah ada di judul halaman.

import { cn } from "@/lib/utils";

// Jendela aplikasi dengan kabel yang terputus: "ada yang rusak".
export function ErrorIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 180" fill="none" aria-hidden className={cn("w-56 sm:w-64", className)}>
      <circle cx="120" cy="92" r="78" className="fill-brand/10" />
      <circle cx="40" cy="38" r="4" className="fill-brand/30" />
      <circle cx="206" cy="146" r="6" className="fill-brand/20" />

      {/* Jendela aplikasi */}
      <rect x="44" y="34" width="152" height="104" rx="12" strokeWidth="2" className="fill-card stroke-border" />
      <path d="M44 46a12 12 0 0 1 12-12h128a12 12 0 0 1 12 12v8H44z" className="fill-muted" />
      <circle cx="58" cy="44" r="3" className="fill-destructive/70" />
      <circle cx="68" cy="44" r="3" className="fill-amber-400" />
      <circle cx="78" cy="44" r="3" className="fill-emerald-400" />

      {/* Kabel kiri + steker */}
      <path d="M58 104h34" strokeWidth="5" strokeLinecap="round" className="stroke-muted-foreground/50" />
      <rect x="90" y="94" width="18" height="20" rx="4" className="fill-brand" />
      <path d="M108 99h7M108 109h7" strokeWidth="3" strokeLinecap="round" className="stroke-brand" />

      {/* Kabel kanan + stopkontak */}
      <path d="M148 104h34" strokeWidth="5" strokeLinecap="round" className="stroke-muted-foreground/50" />
      <rect x="132" y="94" width="18" height="20" rx="4" className="fill-brand/70" />
      <circle cx="137" cy="99" r="1.8" className="fill-card" />
      <circle cx="137" cy="109" r="1.8" className="fill-card" />

      {/* Percikan di celah */}
      <path
        d="M123 80l-4 10h6l-4 10M110 76l3 6M136 76l-3 6M123 120v6"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-amber-500"
      />

      {/* Tanda peringatan */}
      <circle cx="186" cy="36" r="16" className="fill-destructive" />
      <path d="M186 28v9" strokeWidth="3.5" strokeLinecap="round" className="stroke-white" />
      <circle cx="186" cy="43" r="2" className="fill-white" />
    </svg>
  );
}

// Lembar dokumen yang dicari dengan kaca pembesar: "halaman tidak ada".
export function NotFoundIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 180" fill="none" aria-hidden className={cn("w-56 sm:w-64", className)}>
      <circle cx="120" cy="92" r="78" className="fill-brand/10" />
      <circle cx="198" cy="40" r="5" className="fill-brand/30" />
      <circle cx="42" cy="140" r="4" className="fill-brand/20" />

      {/* Dokumen belakang */}
      <rect
        x="62"
        y="40"
        width="84"
        height="108"
        rx="10"
        strokeWidth="2"
        transform="rotate(-8 104 94)"
        className="fill-muted stroke-border"
      />
      {/* Dokumen depan */}
      <rect x="78" y="34" width="84" height="108" rx="10" strokeWidth="2" className="fill-card stroke-border" />
      <path
        d="M92 54h40M92 66h56M92 78h48M92 90h30"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-muted-foreground/25"
      />

      {/* Kaca pembesar dengan tanda tanya */}
      <circle cx="150" cy="104" r="26" strokeWidth="6" className="fill-card stroke-brand" />
      <path d="M169 123l20 20" strokeWidth="9" strokeLinecap="round" className="stroke-brand" />
      <path
        d="M142 98a8 8 0 1 1 11.5 7.2c-2.3 1.1-3.5 2.6-3.5 4.8v1"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-brand"
      />
      <circle cx="150" cy="118" r="2.6" className="fill-brand" />
    </svg>
  );
}
