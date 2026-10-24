// Hash & verifikasi password dengan bcrypt.
//
// Password TIDAK PERNAH disimpan apa adanya. Yang disimpan adalah hash satu
// arah: dari hash tidak bisa dikembalikan ke password asli. Saat login, password
// yang diketik di-hash ulang lalu dibandingkan (bcrypt.compare).
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/authentication.md
//   (bagian "Sign-up and login functionality": contoh bcrypt.hash)
// - https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

// Cost factor: setiap +1 membuat hashing 2x lebih lama. 12 ≈ 200–300 ms,
// cukup lambat untuk menghambat brute force, cukup cepat untuk user.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// Hash palsu, dibuat sekali saat pertama dibutuhkan.
let dummyHash: Promise<string> | undefined;

// `hash` boleh kosong (user dengan email itu tidak ada). Kita tetap menjalankan
// bcrypt.compare terhadap hash palsu supaya waktu respon sama. Kalau tidak,
// penyerang bisa menebak email mana yang terdaftar dari cepat/lambatnya respon
// (timing attack / user enumeration).
export async function verifyPassword(plain: string, hash: string | undefined) {
  if (!hash) {
    dummyHash ??= bcrypt.hash("dummy-password", SALT_ROUNDS);
    await bcrypt.compare(plain, await dummyHash);
    return false;
  }

  return bcrypt.compare(plain, hash);
}

// Huruf/angka yang mirip (0/O, 1/l/I) dibuang agar password sementara tidak
// salah ketik saat disalin dari email.
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 12;

// Password sementara untuk user baru / setelah di-reset OWNER.
// randomInt dari node:crypto memakai sumber acak yang aman untuk kriptografi;
// Math.random() TIDAK aman karena hasilnya bisa ditebak.
// 12 karakter dari 56 simbol ≈ 69 bit, jauh di atas kemampuan tebak online.
export function generateTemporaryPassword() {
  let password = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    password += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return password;
}
