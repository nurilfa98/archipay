const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

// Nominal di database disimpan dalam rupiah (lihat lib/db/schema.ts).
export function formatRupiah(amount: number) {
  return rupiah.format(amount);
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
