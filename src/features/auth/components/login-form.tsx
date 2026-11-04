// Form login. Harus Client Component ("use client") karena memakai hook
// useActionState untuk menampilkan pesan error & status loading.
//
// Alurnya: submit → React memanggil Server Action `login` → hasil return-nya
// menjadi `state` → komponen render ulang dengan pesan error.
// Form tetap berfungsi walau JavaScript belum termuat (progressive enhancement).
//
// Saat kena rate limit ("Terlalu banyak percobaan login"), server mengirim
// retryAfterSeconds: tombol Masuk dikunci dan menampilkan hitungan mundur
// (mm:dd, misal "Masuk (13:59)") sampai boleh mencoba lagi. Batas waktunya dihitung dari jam
// browser saat jawaban diterima, jadi selisih jam server/HP tidak berpengaruh.
// Bila halaman dimuat ulang, kunci hilang, tetapi server tetap menolak dan
// mengirim sisa waktu yang baru.
//
// Komponen Field dari shadcn mengatur jarak label, input, dan pesan error.
// `data-invalid` di <Field> dan `aria-invalid` di <Input> membuat input
// berwarna merah saat ada error, dan dibaca oleh screen reader.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/forms.md
//   (bagian "Validation errors" & "Pending states")
// - https://react.dev/reference/react/useActionState
// - https://ui.shadcn.com/docs/components/field

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { login } from "@/features/auth/actions";
import { useActionResult } from "@/hooks/use-action-result";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);

  // React mengosongkan form otomatis setelah Server Action selesai.
  // Email dibuat "controlled" (disimpan di state) supaya tidak ikut terhapus
  // saat password salah; password tetap dikosongkan demi keamanan.
  const [email, setEmail] = useState("");

  // Kunci tombol Masuk: waktu (ms) boleh mencoba lagi & jam saat ini, diperbarui tiap detik.
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // `state` dibaca langsung (bukan argumen callback) karena tipe argumennya
  // hanya ActionResult biasa, tanpa retryAfterSeconds.
  useActionResult(state, () => {
    const seconds = state?.retryAfterSeconds;
    if (seconds) {
      const current = Date.now();
      setNow(current);
      setLockedUntil(current + seconds * 1000);
    } else {
      setLockedUntil(null);
    }
  });

  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        clearInterval(timer);
        setLockedUntil(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const remainingSeconds = lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = remainingSeconds > 0;
  const countdown = formatCountdown(remainingSeconds);

  const error = state && !state.success ? state : undefined;
  const emailError = error?.fieldErrors?.email?.[0];
  const passwordError = error?.fieldErrors?.password?.[0];

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field data-invalid={!!emailError}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="nama@example.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!emailError}
          />
          <FieldError>{emailError}</FieldError>
        </Field>

        <Field data-invalid={!!passwordError}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={!!passwordError}
          />
          <FieldError>{passwordError}</FieldError>
        </Field>

        {/* Sesi 14 hari bila dicentang; tanpa centang, sesi berakhir saat browser
            ditutup (atau setelah 12 jam). Server membaca value="1". */}
        <Field orientation="horizontal">
          <Checkbox id="rememberMe" name="rememberMe" value="1" />
          <FieldLabel htmlFor="rememberMe" className="font-normal">
            Ingat saya 
          </FieldLabel>
        </Field>

        {/* Error umum (email/password salah, rate limit). role="alert"
            membuat screen reader langsung membacakan pesan ini. */}
        {/* Pesan rate limit hilang setelah hitungan mundur selesai. Hitungan
            mundurnya hanya di tombol, karena isi role="alert" yang berubah
            tiap detik akan dibacakan berulang-ulang oleh screen reader. */}
        {error && !error.fieldErrors && (!state?.retryAfterSeconds || locked) && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        )}

        <Field>
          <Button type="submit" size="lg" disabled={pending || locked}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Memproses..." : locked ? `Masuk (${countdown})` : "Masuk"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

// 840 → "14:00", 65 → "01:05".
function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
