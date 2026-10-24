// Normalisasi nomor WhatsApp Indonesia ke format internasional tanpa "+",
// misalnya "0812-3456-7890", "+62 812 3456 7890", dan "812 3456 7890"
// semuanya menjadi "6281234567890".
//
// Satu format di database membuat pencarian tidak dobel dan nomor langsung
// bisa dipakai untuk mengirim WhatsApp (Fonnte menerima format 62...).

export function normalizeIndonesianPhone(input: string) {
  const digits = input.replace(/\D/g, "");

  let normalized = digits;
  if (digits.startsWith("0")) normalized = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) normalized = `62${digits}`;

  // Nomor seluler Indonesia: 62 + 8xx + 7–10 digit → total 10–15 digit.
  return /^628\d{7,12}$/.test(normalized) ? normalized : null;
}

// "6281234567890" → "+62 812-3456-7890" (hanya untuk tampilan)
export function formatPhone(phone: string) {
  const local = phone.slice(2);
  return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
}
