// Pemeriksaan file nota di server.
//
// Jenis file ditentukan dari BYTE AWAL isinya ("magic bytes"), bukan dari
// nama atau Content-Type kiriman browser, karena keduanya bisa dipalsukan.
// Hanya foto (JPEG/PNG/WebP) dan PDF yang diterima.
//
// Referensi: https://en.wikipedia.org/wiki/List_of_file_signatures

import "server-only";
import { createHash } from "node:crypto";

type ReceiptType = { contentType: string; extension: string };

export function detectReceiptType(bytes: Uint8Array): ReceiptType | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", extension: "jpg" };
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return { contentType: "image/png", extension: "png" };
  // "RIFF" .... "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return { contentType: "image/webp", extension: "webp" };
  }
  // "%PDF"
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return { contentType: "application/pdf", extension: "pdf" };
  return null;
}

// Sidik file SHA-256 (hex). File yang identik byte per byte selalu sama.
export function hashFile(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
