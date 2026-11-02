// Membuat ulang ikon aplikasi (PNG & favicon.ico) dari logo src/app/icon.svg.
// Jalankan setiap kali logo diubah:
//   pnpm icons:generate
//
// Hasil:
//   public/icons/icon-192.png, icon-512.png       → manifest, purpose "any"
//                                                   (sudut membulat transparan)
//   public/icons/maskable-192.png, maskable-512.png → manifest, purpose "maskable"
//                                                   (latar penuh, logo di zona aman 80%;
//                                                   Android yang memotong bentuknya)
//   src/app/apple-icon.png (180×180)              → ikon iPhone/iPad (latar penuh,
//                                                   iOS yang membulatkan sudut)
//   src/app/favicon.ico (16/32/48)                → tab browser
//
// Varian latar penuh dibuat dengan mengubah icon.svg: rx="112" → rx="0", dan
// isi <g id="mark"> diperkecil di tengah. Jadi icon.svg wajib tetap memakai
// keduanya.
//
// sharp tidak dipasang sebagai dependency proyek; script ini meminjam sharp
// milik Next.js (dependency opsional next untuk optimasi gambar).

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");

const root = fileURLToPath(new URL("..", import.meta.url));
const source = fs.readFileSync(path.join(root, "src/app/icon.svg"), "utf8");

if (!source.includes('rx="112"') || !source.includes('<g id="mark">')) {
  console.error('src/app/icon.svg harus memuat rx="112" dan <g id="mark"> (lihat komentar di script ini).');
  process.exit(1);
}

// Latar kotak penuh + logo diperkecil `scale` kali di tengah kanvas 512×512.
function fullBleed(scale) {
  return source
    .replaceAll('rx="112"', 'rx="0"')
    .replace('<g id="mark">', `<g id="mark" transform="translate(256 256) scale(${scale}) translate(-256 -256)">`);
}

function renderPng(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

// File .ico berisi beberapa PNG: header 6 byte + 16 byte per gambar, lalu datanya.
function buildIco(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // tipe: ikon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry); // lebar
    header.writeUInt8(size, entry + 1); // tinggi
    header.writeUInt16LE(1, entry + 4); // color planes
    header.writeUInt16LE(32, entry + 6); // bit per piksel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

const maskable = fullBleed(0.78);
const apple = fullBleed(0.86);

const outputs = {
  "public/icons/icon-192.png": await renderPng(source, 192),
  "public/icons/icon-512.png": await renderPng(source, 512),
  "public/icons/maskable-192.png": await renderPng(maskable, 192),
  "public/icons/maskable-512.png": await renderPng(maskable, 512),
  "src/app/apple-icon.png": await renderPng(apple, 180),
  "src/app/favicon.ico": buildIco(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await renderPng(source, size) }))),
  ),
};

fs.mkdirSync(path.join(root, "public/icons"), { recursive: true });
for (const [file, data] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(root, file), data);
  console.log(`✓ ${file}`);
}
