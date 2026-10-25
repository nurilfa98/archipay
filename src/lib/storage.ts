// Penyimpanan file privat (foto/PDF nota) di Cloudflare R2.
//
// - Bucket PRIVAT: file tidak punya URL publik. Untuk dilihat, server membuat
//   URL bertanda tangan (presigned URL) yang kedaluwarsa dalam beberapa menit,
//   SETELAH mengecek hak akses user (app/api/receipts/[itemId]/route.ts).
// - R2 kompatibel dengan API S3. aws4fetch menandatangani request S3 dengan
//   fetch biasa, jauh lebih ringan daripada AWS SDK.
// - Tanpa R2 (env kosong) saat development: file disimpan di folder .storage/
//   di proyek ini. Di production tanpa R2, unggah gagal dengan pesan jelas.
//
// Referensi:
// - https://developers.cloudflare.com/r2/api/s3/api/
// - https://developers.cloudflare.com/r2/api/s3/presigned-urls/
// - https://github.com/mhart/aws4fetch

import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { env } from "@/lib/env";

const PRESIGNED_URL_SECONDS = 300; // 5 menit

const r2 =
  env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET
    ? {
        client: new AwsClient({
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          service: "s3",
          region: "auto",
        }),
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`,
      }
    : null;

const LOCAL_ROOT = path.join(process.cwd(), ".storage");

export const isLocalStorage = !r2;

// key contoh: "receipts/<advanceId>/<itemId>.jpg". Hanya dibuat oleh server.
export async function putObject(key: string, body: Uint8Array<ArrayBuffer>, contentType: string) {
  if (r2) {
    const response = await r2.client.fetch(objectUrl(key), {
      method: "PUT",
      body,
      headers: { "content-type": contentType },
    });
    if (!response.ok) throw new Error(`Gagal mengunggah ke R2 (${response.status})`);
    return;
  }
  assertLocalAllowed();
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function deleteObject(key: string) {
  if (r2) {
    const response = await r2.client.fetch(objectUrl(key), { method: "DELETE" });
    // 404 = sudah tidak ada, anggap berhasil.
    if (!response.ok && response.status !== 404) throw new Error(`Gagal menghapus dari R2 (${response.status})`);
    return;
  }
  await rm(localPath(key), { force: true });
}

// R2: URL sementara untuk membuka file. Lokal: null (file dibaca dengan readLocalObject).
export async function getPresignedUrl(key: string) {
  if (!r2) return null;
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(PRESIGNED_URL_SECONDS));
  const signed = await r2.client.sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
  return signed.url;
}

export async function readLocalObject(key: string) {
  assertLocalAllowed();
  return readFile(localPath(key));
}

function objectUrl(key: string) {
  return `${r2!.endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

// path.join + cek awalan mencegah key berisi "../" keluar dari folder .storage.
function localPath(key: string) {
  const file = path.join(LOCAL_ROOT, key);
  if (!file.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Key file tidak valid");
  return file;
}

function assertLocalAllowed() {
  if (env.NODE_ENV === "production") {
    throw new Error("Penyimpanan file belum diatur. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.");
  }
}
