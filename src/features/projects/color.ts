// Warna kartu project dibuat otomatis dari id-nya: id yang sama selalu
// menghasilkan warna yang sama, tanpa kolom tambahan di database. Hanya HUE
// (0-359) yang dihitung di sini; kecerahan dan kepekatan diatur kelas
// .project-accent di globals.css (terang dan gelap), sehingga semua warna
// project terlihat selaras.

export function projectHue(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}
