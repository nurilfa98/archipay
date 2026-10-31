// Kategori biaya awal untuk setiap company baru. Setelah company dibuat,
// Owner bisa mengubah, menambah, atau menonaktifkannya di menu Pengaturan.
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Transportasi",
  "Konsumsi",
  "ATK & Fotokopi",
  "Parkir & Tol",
  "Materai & Perizinan",
  "Lain-lain",
] as const;
