// Kamera selfie dengan cek liveness (BUSINESS-FLOW §18.4–18.5), dipakai untuk
// mendaftarkan foto acuan wajah (FaceCapture) dan untuk absen masuk/pulang
// (SelfieCamera di check-flow.tsx).
//
// Alur di HP:
// 1. Kamera depan dibuka (getUserMedia). Tidak ada pilihan unggah dari galeri.
// 2. @vladmandic/human (TensorFlow.js, berjalan di browser) memeriksa setiap
//    frame dengan model RINGAN saja (deteksi wajah, mesh, ekspresi): harus
//    tepat satu wajah, cukup dekat, dan di tengah bingkai → bingkai hijau
//    setengah.
// 3. Karyawan diminta tersenyum (tantangan liveness). Senyum terdeteksi →
//    bingkai hijau penuh, foto diambil otomatis. Senyum dipakai (bukan kedip)
//    karena kedip hanya ±0,1–0,3 detik dan sering terlewat di HP yang lambat;
//    senyum ditahan sehingga selalu tertangkap.
// 4. Foto diambil dari frame wajah NETRAL sesaat sebelum tersenyum (agar
//    pencocokan dengan foto acuan tetap akurat). Baru di langkah ini model
//    BERAT dijalankan sekali: face embedding (1024 angka), anti-spoof &
//    liveness. Menjalankan model berat di setiap frame-lah yang dulu membuat
//    kamera terasa lambat.
// 5. Foto dipotong PERSEGI (bagian tengah frame, sama dengan yang terlihat di
//    layar) supaya kartu di halaman persetujuan tidak memanjang ke bawah.
//    Foto disimpan TERCERMIN, sama dengan tampilan kamera depan; embedding
//    dihitung dari gambar asli (tidak dicerminkan).
//    - Daftar foto acuan: foto (JPEG, sisi terpanjang 640 px) + embedding
//      dikirim ke server dan disimpan sebagai acuan.
//    - Absen: hanya embedding yang dikirim; server membandingkannya dengan
//      foto acuan (features/attendance/face-match.ts). Selfie absen tidak
//      dikirim dan tidak disimpan.
//
// Library & modelnya (±12 MB, sekali unduh lalu di-cache browser) dimuat
// hanya saat kamera dibuka, lewat dynamic import.
//
// Referensi:
// - https://github.com/vladmandic/human (Config, FaceResult, emotion, mesh)
// - https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia

"use client";

import type { Config, FaceResult, Human } from "@vladmandic/human";
import { CameraIcon, LoaderCircleIcon, RotateCcwIcon, SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { FACE_EMBEDDING_LENGTH } from "../constants";
import { submitFaceProfile } from "../face-actions";

// Model diambil dari CDN jsDelivr dengan versi terkunci (sama dengan
// package.json & FACE_MODEL_VERSION di constants.ts).
const MODEL_BASE_PATH = "https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/";

// Ambang skor model anti-spoof (`real`) & liveness (`live`), 0..1. Nilai di
// atas 0,5 dianggap wajah asli, sesuai contoh resmi library.
const REAL_MIN = 0.5;
const LIVE_MIN = 0.5;
// Lebar kotak wajah minimal (porsi lebar video) agar wajah cukup jelas.
const FACE_MIN_WIDTH = 0.28;
// Titik tengah wajah harus di area tengah ini (porsi lebar/tinggi video).
const CENTER_MARGIN = 0.25;
const PHOTO_MAX_SIDE = 640;
// Senyum: skor ekspresi "happy" ≥ ini, ATAU lebar mulut (relatif terhadap
// jarak kedua mata) naik ≥ SMILE_WIDEN dari wajah netral.
const HAPPY_MIN = 0.6;
const SMILE_WIDEN = 1.12;
// Frame netral yang lebih tua dari ini tidak dipakai (wajah mungkin bergeser).
const NEUTRAL_MAX_AGE_MS = 1500;

const BASE_FACE = {
  enabled: true,
  detector: { rotation: false, maxDetected: 2, minConfidence: 0.5 },
  mesh: { enabled: true },
  iris: { enabled: false },
  attention: { enabled: false },
  gear: { enabled: false },
};

// human.detect() MENGGABUNGKAN config ke instance, jadi setiap panggilan harus
// menyebut lengkap model mana yang aktif.
// - Setiap frame: ringan (deteksi + mesh + ekspresi).
const LOOP_CONFIG: Partial<Config> = {
  face: {
    ...BASE_FACE,
    emotion: { enabled: true },
    description: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },
};
// - Sekali saat foto diambil: embedding + anti-spoof + liveness.
const CAPTURE_CONFIG: Partial<Config> = {
  face: {
    ...BASE_FACE,
    emotion: { enabled: false },
    description: { enabled: true },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
};

const HUMAN_CONFIG: Partial<Config> = {
  modelBasePath: MODEL_BASE_PATH,
  backend: "webgl",
  debug: false,
  // 0 = tanpa cache antar-frame: setiap deteksi memakai frame terbaru.
  cacheSensitivity: 0,
  // Semua model diaktifkan saat dimuat agar sudah terunduh & siap sebelum dipakai.
  face: {
    ...BASE_FACE,
    emotion: { enabled: true },
    description: { enabled: true },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  segmentation: { enabled: false },
  gesture: { enabled: false },
  filter: { enabled: true, flip: false },
};

export type CapturedSelfie = { blob: Blob; url: string; embedding: number[] };

// Embedding ke FormData (5 desimal cukup untuk perbandingan & lebih kecil).
// Dipakai saat absen: foto tidak ikut dikirim.
export function appendEmbedding(formData: FormData, selfie: CapturedSelfie) {
  formData.set("embedding", JSON.stringify(selfie.embedding.map((n) => Math.round(n * 1e5) / 1e5)));
}

// Foto + embedding ke FormData, untuk pendaftaran foto acuan.
function appendSelfie(formData: FormData, selfie: CapturedSelfie) {
  formData.set("photo", new File([selfie.blob], "wajah.jpg", { type: "image/jpeg" }));
  appendEmbedding(formData, selfie);
}

type Phase = "idle" | "loading" | "camera" | "captured";
type Hint = { text: string; tone: "info" | "warn" | "ok" };

// Pendeteksi wajah dipakai bersama selama halaman terbuka (model berat).
let sharedHuman: Promise<Human> | null = null;
function loadHuman() {
  sharedHuman ??= import("@vladmandic/human").then(async ({ Human }) => {
    const human = new Human(HUMAN_CONFIG);
    await human.load();
    await human.warmup();
    return human;
  });
  sharedHuman.catch(() => {
    sharedHuman = null;
  });
  return sharedHuman;
}

export function SelfieCamera({
  onChange,
  disabled = false,
  idleText = "Cari tempat yang terang, lepas masker & kacamata hitam, lalu buka kamera.",
}: {
  onChange: (selfie: CapturedSelfie | null) => void;
  disabled?: boolean;
  idleText?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const humanRef = useRef<Human | null>(null);
  const runningRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [hint, setHint] = useState<Hint>({ text: "", tone: "info" });
  // 0 = belum pas, 0,5 = wajah pas (hijau setengah), 1 = senyum (hijau penuh).
  const [progress, setProgress] = useState(0);
  const [photo, setPhoto] = useState<CapturedSelfie | null>(null);

  useEffect(() => () => stopCamera(), []);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify.error("Browser ini tidak bisa membuka kamera. Pakai Chrome atau Safari terbaru.");
      return;
    }
    setPhoto(null);
    onChange(null);
    setProgress(0);
    setPhase("loading");
    setHint({ text: "Menyiapkan pendeteksi wajah...", tone: "info" });
    try {
      humanRef.current = await loadHuman();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setPhase("camera");
      void detectLoop();
    } catch (error) {
      stopCamera();
      setPhase("idle");
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      notify.error(
        denied
          ? "Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser."
          : "Kamera atau pendeteksi wajah gagal dibuka. Periksa koneksi internet lalu coba lagi.",
      );
      console.error("[attendance] kamera/human gagal", error);
    }
  }

  async function detectLoop() {
    const human = humanRef.current;
    const video = videoRef.current;
    if (!human || !video) return;
    runningRef.current = true;
    // Frame netral terakhir (wajah pas, belum tersenyum) dan lebar mulut netral.
    const neutral = document.createElement("canvas");
    let neutralAt = 0;
    let neutralMouth: number | null = null;

    while (runningRef.current) {
      const result = await human.detect(video, LOOP_CONFIG);
      if (!runningRef.current) break;
      const check = checkPosition(result.face, video.videoWidth, video.videoHeight);
      if (!check.ok) {
        setProgress(0);
        setHint({ text: check.message, tone: "warn" });
        neutralAt = 0;
        neutralMouth = null;
      } else {
        const face = result.face[0];
        const mouth = mouthRatio(face);
        const happy = face.emotion?.find((item) => item.emotion === "happy")?.score ?? 0;
        const smiling =
          happy >= HAPPY_MIN || (mouth !== null && neutralMouth !== null && mouth >= neutralMouth * SMILE_WIDEN);

        if (!smiling) {
          // Simpan frame netral terbaru + perbarui lebar mulut netral (rata-rata bergerak).
          drawFrame(neutral, video);
          neutralAt = performance.now();
          if (mouth !== null) neutralMouth = neutralMouth === null ? mouth : neutralMouth * 0.8 + mouth * 0.2;
          setProgress(0.5);
          setHint({ text: "Wajah pas. Sekarang tersenyum.", tone: "ok" });
        } else {
          setProgress(1);
          runningRef.current = false;
          const fresh = neutralAt > 0 && performance.now() - neutralAt <= NEUTRAL_MAX_AGE_MS;
          await capture(fresh ? neutral : null);
          return;
        }
      }
      // Beri jeda satu frame layar agar UI tetap responsif.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  // `source` = frame netral sebelum tersenyum; null = pakai frame saat ini.
  async function capture(source: HTMLCanvasElement | null) {
    const human = humanRef.current;
    const video = videoRef.current;
    if (!human || !video) return;
    setHint({ text: "Memproses foto...", tone: "info" });

    const canvas = source ?? drawFrame(document.createElement("canvas"), video);
    const result = await human.detect(canvas, CAPTURE_CONFIG);
    const check = checkCapture(result.face, canvas.width, canvas.height);
    const embedding = result.face[0]?.embedding;
    if (!check.ok || !embedding || embedding.length !== FACE_EMBEDDING_LENGTH) {
      setProgress(0);
      setHint({ text: check.ok ? "Wajah kurang jelas. Coba lagi." : check.message, tone: "warn" });
      void detectLoop();
      return;
    }

    // Foto dicerminkan agar sama dengan tampilan kamera depan.
    const mirrored = document.createElement("canvas");
    mirrored.width = canvas.width;
    mirrored.height = canvas.height;
    const context = mirrored.getContext("2d")!;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(canvas, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => mirrored.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) {
      notify.error("Foto gagal dibuat. Coba lagi.");
      return;
    }
    stopCamera();
    const selfie = { blob, url: URL.createObjectURL(blob), embedding: Array.from(embedding) };
    setPhoto(selfie);
    setPhase("captured");
    onChange(selfie);
  }

  function stopCamera() {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl border bg-muted">
        {/* Tampilan kamera dicerminkan seperti cermin; foto hasilnya juga dicerminkan. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn("size-full -scale-x-100 object-cover", phase !== "camera" && "hidden")}
        />
        {phase === "captured" && photo && (
          // eslint-disable-next-line @next/next/no-img-element -- pratinjau blob lokal
          <img src={photo.url} alt="Pratinjau foto wajah" className="size-full object-cover" />
        )}
        {phase === "camera" && <FaceGuide progress={progress} />}
        {(phase === "idle" || phase === "loading") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            {phase === "loading" ? (
              <LoaderCircleIcon className="size-8 animate-spin" />
            ) : (
              <CameraIcon className="size-10" />
            )}
            <p>
              {phase === "loading"
                ? "Menyiapkan kamera & pendeteksi wajah. Pertama kali bisa sampai 1 menit."
                : idleText}
            </p>
          </div>
        )}
      </div>

      {hint.text && (phase === "loading" || phase === "camera") && (
        <p
          role="status"
          className={cn(
            "text-center text-sm font-medium",
            hint.tone === "warn" && "text-amber-700 dark:text-amber-400",
            hint.tone === "ok" && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {hint.text}
        </p>
      )}

      {phase === "idle" && (
        <Button type="button" onClick={start} disabled={disabled}>
          <CameraIcon />
          Buka kamera
        </Button>
      )}
      {phase === "camera" && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            stopCamera();
            setPhase("idle");
          }}
        >
          Batal
        </Button>
      )}
      {phase === "captured" && (
        <Button type="button" variant="outline" onClick={start} disabled={disabled}>
          <RotateCcwIcon />
          Ambil ulang
        </Button>
      )}
    </div>
  );
}

// Bingkai oval dengan garis kemajuan hijau: 0 = putih, 0,5 = hijau setengah
// (wajah pas), 1 = hijau penuh (tersenyum, foto diambil).
function FaceGuide({ progress }: { progress: number }) {
  return (
    <div className="pointer-events-none absolute inset-[12%]">
      <div className="absolute inset-0 rounded-[50%] border-4 border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
        <ellipse
          cx="50"
          cy="50"
          rx="49"
          ry="49"
          fill="none"
          pathLength={100}
          strokeDasharray={`${progress * 100} 100`}
          transform="rotate(90 50 50)"
          vectorEffect="non-scaling-stroke"
          className="stroke-emerald-500 transition-[stroke-dasharray] duration-300"
          strokeWidth={6}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// Pendaftaran foto acuan wajah (halaman /attendance/enroll).
export function FaceCapture() {
  const router = useRouter();
  const [selfie, setSelfie] = useState<CapturedSelfie | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!selfie) return;
    const formData = new FormData();
    appendSelfie(formData, selfie);
    startTransition(async () => {
      const result = await submitFaceProfile(formData);
      if (!result.success) {
        notify.error(result.message);
        return;
      }
      notify.success("Owner atau Admin HR akan memeriksa foto Anda. Setelah disetujui, Anda bisa absen.", {
        title: "Foto wajah terkirim",
      });
      router.push("/attendance");
    });
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <SelfieCamera onChange={setSelfie} disabled={pending} />
      {selfie && (
        <Button onClick={send} disabled={pending}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
          {pending ? "Mengirim..." : "Kirim foto"}
        </Button>
      )}
    </div>
  );
}

// Salin bagian tengah frame video yang PERSEGI (sama dengan yang terlihat di
// layar, object-cover) ke canvas, maksimal PHOTO_MAX_SIDE, tidak dicerminkan.
function drawFrame(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const side = Math.min(video.videoWidth, video.videoHeight);
  const out = Math.min(PHOTO_MAX_SIDE, side);
  canvas.width = out;
  canvas.height = out;
  canvas
    .getContext("2d")!
    .drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, out, out);
  return canvas;
}

// Lebar mulut ÷ jarak sudut luar kedua mata (titik mesh MediaPipe 468:
// 61 & 291 = sudut bibir, 33 & 263 = sudut luar mata). Naik saat tersenyum.
function mouthRatio(face: FaceResult) {
  const mesh = face.mesh;
  if (!mesh || mesh.length < 300) return null;
  const distance = (a: number, b: number) => Math.hypot(mesh[a][0] - mesh[b][0], mesh[a][1] - mesh[b][1]);
  const eyes = distance(33, 263);
  return eyes > 0 ? distance(61, 291) / eyes : null;
}

type Check = { ok: true } | { ok: false; message: string };

// Setiap frame: jumlah wajah, ukuran, dan posisi di tengah bingkai. Yang terlihat
// dan difoto adalah persegi di tengah frame, jadi ukuran & posisi dihitung
// terhadap persegi itu (untuk canvas yang sudah persegi, selisihnya 0).
function checkPosition(faces: FaceResult[], frameWidth: number, frameHeight: number): Check {
  if (faces.length === 0) return { ok: false, message: "Wajah belum terlihat. Posisikan wajah di dalam bingkai." };
  if (faces.length > 1) return { ok: false, message: "Terlihat lebih dari satu wajah. Pastikan hanya Anda di kamera." };
  const [x, y, width, height] = faces[0].box;
  const side = Math.min(frameWidth, frameHeight);
  if (width < side * FACE_MIN_WIDTH) return { ok: false, message: "Dekatkan wajah ke kamera." };
  const centerX = (x + width / 2 - (frameWidth - side) / 2) / side;
  const centerY = (y + height / 2 - (frameHeight - side) / 2) / side;
  const centered =
    centerX >= CENTER_MARGIN && centerX <= 1 - CENTER_MARGIN && centerY >= CENTER_MARGIN && centerY <= 1 - CENTER_MARGIN;
  if (!centered) return { ok: false, message: "Posisikan wajah di tengah bingkai." };
  return { ok: true };
}

// Saat foto diambil: posisi + lolos model anti-spoof & liveness.
function checkCapture(faces: FaceResult[], frameWidth: number, frameHeight: number): Check {
  const position = checkPosition(faces, frameWidth, frameHeight);
  if (!position.ok) return position;
  const face = faces[0];
  if ((face.real ?? 0) < REAL_MIN || (face.live ?? 0) < LIVE_MIN) {
    return { ok: false, message: "Wajah belum terbaca sebagai wajah asli. Hadap kamera langsung di tempat terang." };
  }
  return { ok: true };
}
