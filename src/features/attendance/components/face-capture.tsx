// Kamera selfie dengan cek liveness (BUSINESS-FLOW §18.4–18.5), dipakai untuk
// mendaftarkan foto acuan wajah (FaceCapture) dan untuk absen masuk/pulang
// (SelfieCamera di check-flow.tsx).
//
// Alur di HP:
// 1. Kamera depan dibuka (getUserMedia). Tidak ada pilihan unggah dari galeri.
// 2. @vladmandic/human (TensorFlow.js, berjalan di browser) mendeteksi wajah
//    beberapa kali per detik: harus tepat satu wajah, cukup dekat, menghadap
//    kamera, dan lolos model anti-spoof & liveness.
// 3. Karyawan diminta berkedip. Setelah kedipan terdeteksi dan mata terbuka
//    lagi, foto diambil otomatis.
// 4. Dari foto itu dihitung face embedding (1024 angka). Foto (JPEG, sisi
//    terpanjang 640 px) + embedding dikirim ke server, yang membandingkannya
//    dengan foto acuan (features/attendance/face-match.ts).
//
// Library & modelnya (±12 MB, sekali unduh lalu di-cache browser) dimuat
// hanya saat kamera dibuka, lewat dynamic import.
//
// Referensi:
// - https://github.com/vladmandic/human (Config, FaceResult, gesture)
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
const PHOTO_MAX_SIDE = 640;

const HUMAN_CONFIG: Partial<Config> = {
  modelBasePath: MODEL_BASE_PATH,
  backend: "webgl",
  debug: false,
  // 0 = tanpa cache antar-frame: setiap deteksi memakai frame terbaru.
  cacheSensitivity: 0,
  face: {
    enabled: true,
    detector: { rotation: false, maxDetected: 2, minConfidence: 0.5 },
    mesh: { enabled: true },
    iris: { enabled: false },
    description: { enabled: true },
    emotion: { enabled: false },
    antispoof: { enabled: true },
    liveness: { enabled: true },
    attention: { enabled: false },
    gear: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  segmentation: { enabled: false },
  gesture: { enabled: true },
  filter: { enabled: true, flip: false },
};

export type CapturedSelfie = { blob: Blob; url: string; embedding: number[] };

// Foto + embedding ke FormData (5 desimal cukup untuk perbandingan & lebih kecil).
export function appendSelfie(formData: FormData, selfie: CapturedSelfie) {
  formData.set("photo", new File([selfie.blob], "wajah.jpg", { type: "image/jpeg" }));
  formData.set("embedding", JSON.stringify(selfie.embedding.map((n) => Math.round(n * 1e5) / 1e5)));
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
    let eyesClosedSeen = false;

    while (runningRef.current) {
      const result = await human.detect(video);
      if (!runningRef.current) break;
      const check = checkFace(result.face, video.videoWidth);
      if (!check.ok) {
        setHint({ text: check.message, tone: "warn" });
      } else {
        const closed = result.gesture.some(
          (gesture) =>
            "face" in gesture && (gesture.gesture === "blink left eye" || gesture.gesture === "blink right eye"),
        );
        if (closed) eyesClosedSeen = true;
        if (!eyesClosedSeen) {
          setHint({ text: "Wajah terdeteksi. Sekarang kedipkan mata Anda.", tone: "ok" });
        } else if (!closed) {
          // Kedip selesai (mata terbuka lagi) → ambil foto.
          runningRef.current = false;
          await capture();
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  async function capture() {
    const human = humanRef.current;
    const video = videoRef.current;
    if (!human || !video) return;
    setHint({ text: "Memproses foto...", tone: "info" });

    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);

    const result = await human.detect(canvas);
    const check = checkFace(result.face, canvas.width);
    const embedding = result.face[0]?.embedding;
    if (!check.ok || !embedding || embedding.length !== FACE_EMBEDDING_LENGTH) {
      setHint({ text: check.ok ? "Wajah kurang jelas. Coba lagi." : check.message, tone: "warn" });
      runningRef.current = true;
      void detectLoop();
      return;
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
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
      <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl border bg-muted">
        {/* Tampilan kamera dicerminkan agar terasa seperti cermin; foto yang disimpan tidak. */}
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
        {phase === "camera" && (
          <div className="pointer-events-none absolute inset-[12%] rounded-[50%] border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        )}
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

function checkFace(faces: FaceResult[], frameWidth: number): { ok: true } | { ok: false; message: string } {
  if (faces.length === 0) return { ok: false, message: "Wajah belum terlihat. Posisikan wajah di dalam bingkai." };
  if (faces.length > 1) return { ok: false, message: "Terlihat lebih dari satu wajah. Pastikan hanya Anda di kamera." };
  const face = faces[0];
  if (face.box[2] < frameWidth * FACE_MIN_WIDTH) return { ok: false, message: "Dekatkan wajah ke kamera." };
  if ((face.real ?? 0) < REAL_MIN || (face.live ?? 0) < LIVE_MIN) {
    return { ok: false, message: "Wajah belum terbaca sebagai wajah asli. Hadap kamera langsung di tempat terang." };
  }
  return { ok: true };
}
