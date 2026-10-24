const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

export function formatRupiah(amountSen: number) {
  return rupiah.format(amountSen / 100);
}
