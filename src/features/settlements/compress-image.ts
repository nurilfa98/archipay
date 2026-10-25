// Kompres foto nota di browser SEBELUM diunggah: sisi terpanjang diperkecil
// ke 1600 px dan disimpan sebagai JPEG kualitas 80%. Foto kamera HP 3–8 MB
// biasanya menjadi 200–500 KB: unggah lebih cepat, hemat kuota, dan tulisan
// di nota tetap terbaca.
//
// PDF dan file yang tidak bisa dibaca browser (misal HEIC di Chrome)
// dikirim apa adanya; server tetap memeriksa jenis & ukurannya.
//
// Referensi:
// - https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
// - https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    // imageOrientation: foto HP yang diambil miring tetap tegak.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) return file;
    // Latar putih: PNG transparan tidak menjadi hitam setelah diubah ke JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    // Hasil kompres lebih besar (jarang, misal gambar sudah kecil): pakai aslinya.
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
