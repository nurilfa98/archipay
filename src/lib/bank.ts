// Format nomor rekening agar mudah dibaca (pola dari SakuDagang): strip
// otomatis saat mengetik, pola kelompok digit mengikuti kebiasaan tiap bank.
// Di database tetap disimpan angka saja (features/users/schemas.ts,
// features/subscriptions/schemas.ts), format hanya untuk tampilan & input.
//
// Pola per bank (dari cara bank menampilkan nomornya sendiri):
//   BCA     10 digit  123-456-7890        (3-3-4)
//   Mandiri 13 digit  123-00-1234567-8    (3-2-7-1)
//   BRI     15 digit  1234-01-012345-50-3 (4-2-6-2-1)
//   BNI     10 digit  1234-567-890        (4-3-3)
//   lainnya           kelompok 4 digit
// Bank dicocokkan dari nama yang diketik (mengandung "bca", "mandiri", …).

import { groupDigits } from "@/lib/phone";

const BANK_PATTERNS: { match: RegExp; groups: number[] }[] = [
  { match: /\bbca\b/i, groups: [3, 3, 4] },
  { match: /mandiri/i, groups: [3, 2, 7, 1] },
  { match: /\bbri\b/i, groups: [4, 2, 6, 2, 1] },
  { match: /\bbni\b/i, groups: [4, 3, 3] },
];

const MAX_ACCOUNT_DIGITS = 20;

export function formatAccountNumber(bankName: string | null | undefined, raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, MAX_ACCOUNT_DIGITS);
  const pattern = BANK_PATTERNS.find((bank) => bank.match.test(bankName ?? ""));
  if (!pattern) return groupDigits(digits, 4);

  const groups: string[] = [];
  let index = 0;
  for (const size of pattern.groups) {
    if (index >= digits.length) break;
    groups.push(digits.slice(index, index + size));
    index += size;
  }
  // Digit melebihi pola (nomor lebih panjang dari biasanya) menempel di akhir.
  if (index < digits.length) groups.push(digits.slice(index));
  return groups.join("-");
}

// Contoh nomor untuk placeholder isian, mengikuti pola bank yang sedang
// diketik: BCA "123-456-7890", Mandiri "123-45-6789012-3", lainnya
// "1234-5678-90". Tetap tampil walau nama bank sudah diisi.
export function accountNumberPlaceholder(bankName: string | null | undefined) {
  const pattern = BANK_PATTERNS.find((bank) => bank.match.test(bankName ?? ""));
  const length = pattern ? pattern.groups.reduce((total, size) => total + size, 0) : 10;
  return formatAccountNumber(bankName, "1234567890".repeat(2).slice(0, length));
}

// Warna khas tiap bank untuk garis tepi kartu rekening (Langganan & Pengaturan platform),
// agar rekening mudah dikenali sekilas. Kelas ditulis lengkap (bukan dirangkai)
// supaya terbaca Tailwind. Bank lain memakai warna netral.
const BANK_ACCENTS: { match: RegExp; className: string }[] = [
  { match: /\bbca\b/i, className: "border-[#0060AF] text-[#0060AF] dark:border-[#4A9BE0] dark:text-[#4A9BE0]" },
  { match: /\bbri\b/i, className: "border-[#00529C] text-[#00529C] dark:border-[#5A9BD8] dark:text-[#5A9BD8]" },
  { match: /mandiri/i, className: "border-[#003D79] text-[#003D79] dark:border-[#F2B700] dark:text-[#F2B700]" },
  { match: /\bbni\b/i, className: "border-[#F15A22] text-[#F15A22] dark:border-[#F58A5C] dark:text-[#F58A5C]" },
  { match: /\bbsi\b|syariah indonesia/i, className: "border-[#00A39D] text-[#00A39D] dark:border-[#3FC9C3] dark:text-[#3FC9C3]" },
  { match: /cimb/i, className: "border-[#EE1C25] text-[#EE1C25] dark:border-[#F2686E] dark:text-[#F2686E]" },
  { match: /jago/i, className: "border-[#F7B500] text-[#B88600] dark:border-[#F7B500] dark:text-[#F7B500]" },
  { match: /seabank/i, className: "border-[#F15A22] text-[#F15A22] dark:border-[#F58A5C] dark:text-[#F58A5C]" },
  { match: /permata/i, className: "border-[#00A651] text-[#00A651] dark:border-[#4CD080] dark:text-[#4CD080]" },
  { match: /danamon/i, className: "border-[#F58220] text-[#F58220] dark:border-[#F8A45C] dark:text-[#F8A45C]" },
  { match: /\bbtn\b/i, className: "border-[#1C3F94] text-[#1C3F94] dark:border-[#6C8BD8] dark:text-[#6C8BD8]" },
];

// Kelas Tailwind (warna garis tepi + warna nama bank) untuk kartu rekening.
export function bankAccentClass(bankName: string | null | undefined) {
  return BANK_ACCENTS.find((bank) => bank.match.test(bankName ?? ""))?.className ?? "border-border text-foreground";
}
