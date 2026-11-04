// Logo ArchiPay: huruf "A" berbentuk atap (project) dengan koin emas (uang)
// di atas latar indigo. Gambar yang sama dengan ikon aplikasi di layar HP
// (src/app/icon.svg → public/icons/*.png); kalau logo diubah, ubah keduanya.
//
// Ukuran diatur lewat className (misal "size-8").
//
// ID gradien dibuat unik per logo (useId). Bila satu halaman punya dua logo
// dengan ID sama, browser memakai gradien milik logo pertama; kalau logo itu
// tersembunyi (display:none, misal panel kiri login di HP), gradiennya tidak
// digambar dan logo lain ikut kehilangan warna (tinggal huruf A putih).

import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  const bg = `${id}-bg`;
  const shine = `${id}-shine`;
  const coin = `${id}-coin`;

  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#3730a3" />
        </linearGradient>
        <radialGradient id={shine} cx=".25" cy=".15" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={coin} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${bg})`} />
      <rect width="512" height="512" rx="112" fill={`url(#${shine})`} />
      <path
        d="M140 384 L256 128 L372 384"
        fill="none"
        stroke="#fff"
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="256" cy="318" r="42" fill={`url(#${coin})`} />
      <circle cx="256" cy="318" r="27" fill="none" stroke="#b45309" strokeOpacity=".35" strokeWidth="6" />
    </svg>
  );
}
