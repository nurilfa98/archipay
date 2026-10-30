const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

// Nominal di database disimpan dalam rupiah (lihat lib/db/schema.ts).
export function formatRupiah(amount: number) {
  return rupiah.format(amount);
}

const compactNumber = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

// Rupiah ringkas untuk label grafik yang sempit: "Rp 12,5 jt", "Rp 850 rb".
export function formatRupiahCompact(amount: number) {
  return `${amount < 0 ? "-" : ""}Rp ${compactNumber.format(Math.abs(amount))}`;
}

// Nama bulan, indeks 0 = Januari. Untuk pilihan filter bulan.
export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;
