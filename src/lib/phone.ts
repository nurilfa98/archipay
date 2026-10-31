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

// Tampilan nomor: format lokal, strip tiap 4 digit agar mudah dibaca
// (mengikuti SakuDagang): "6285714325506" → "0857-1432-5506". Dipakai di
// tabel, detail, dan sebagai nilai awal input.
export function formatPhone(phone: string) {
  const local = phone.startsWith("62") ? `0${phone.slice(2)}` : phone;
  return groupDigits(local, 4);
}

// Format sambil mengetik (components/phone-input.tsx): hanya angka, strip
// otomatis tiap 4 digit, maksimal 13 digit (0 + 12). Pengguna tidak perlu
// mengetik strip sendiri; server tetap membaca angkanya saja.
export function formatPhoneInput(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 13);
  return groupDigits(digits, 4);
}

// "085714325506" → "0857-1432-5506"; sisa digit menempel di kelompok terakhir.
export function groupDigits(digits: string, size: number, separator = "-") {
  const groups: string[] = [];
  for (let index = 0; index < digits.length; index += size) groups.push(digits.slice(index, index + size));
  return groups.join(separator);
}
