// Form verifikasi nomor WhatsApp dengan kode OTP (halaman /verify-phone).
// Langkah 1: isi nomor → "Kirim kode". Langkah 2: isi 6 angka kode yang
// diterima di WhatsApp → "Verifikasi". Nomor baru tersimpan setelah kode cocok.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestPhoneOtp, verifyPhoneOtp } from "@/features/auth/phone-actions";
import { formatPhone } from "@/lib/phone";
import { notify } from "@/lib/notify";

export function PhoneVerifyForm({
  defaultPhone,
  returnTo,
}: {
  defaultPhone: string | null;
  returnTo: "home" | "profile";
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [transitionPending, startTransition] = useTransition();
  const [verified, setVerified] = useState(false);
  const pending = transitionPending || verified;
  // Penjaga tekan ganda: `pending` baru true setelah render ulang, jadi dua
  // ketukan cepat bisa memanggil requestPhoneOtp dua kali (OTP terkirim 2x).
  // Server juga menolak permintaan kedua (phone-actions.ts).
  const sendingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function send(phoneInput: string) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    startTransition(async () => {
      const result = await requestPhoneOtp(phoneInput).finally(() => {
        sendingRef.current = false;
      });
      if (!result.success) {
        setErrors({ phoneNumber: result.fieldErrors?.phoneNumber?.[0] });
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      setErrors({});
      setPhone(result.data.phone);
      setCooldown(result.data.cooldownSeconds);
      setStep("code");
      notify.success(`Kode dikirim ke WhatsApp ${formatPhone(result.data.phone)}.`);
    });
  }

  function verify(code: string) {
    startTransition(async () => {
      const result = await verifyPhoneOtp(code, returnTo);
      if (!result.success) {
        setErrors({ code: result.fieldErrors?.code?.[0] });
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      // Muat penuh (bukan router.push): status verifikasi ada di data user
      // yang di-cache browser, jadi semua halaman harus dibaca ulang dari
      // server. Tombol tetap terkunci sampai halaman tujuan terbuka.
      setVerified(true);
      window.location.replace(result.data.redirectTo);
    });
  }

  if (step === "phone") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(String(new FormData(event.currentTarget).get("phoneNumber") ?? ""));
        }}
      >
        <FieldGroup>
          <PhoneInput
            name="phoneNumber"
            label="Nomor WhatsApp"
            description="Kode verifikasi 6 angka akan dikirim ke nomor ini lewat WhatsApp."
            defaultValue={defaultPhone}
            required
            error={errors.phoneNumber}
          />
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            Kirim kode
          </Button>
        </FieldGroup>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        verify(String(new FormData(event.currentTarget).get("code") ?? ""));
      }}
    >
      <FieldGroup>
        <Field data-invalid={!!errors.code}>
          <FieldLabel htmlFor="code">Kode verifikasi</FieldLabel>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            className="text-center text-lg tracking-[0.5em] tabular-nums"
            aria-invalid={!!errors.code}
            autoFocus
            required
          />
          <FieldDescription>Dikirim ke WhatsApp {phone ? formatPhone(phone) : ""}. Berlaku 10 menit.</FieldDescription>
          <FieldError>{errors.code}</FieldError>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircleIcon className="animate-spin" />}
          Verifikasi
        </Button>
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={pending || cooldown > 0 || !phone}
            onClick={() => phone && send(phone)}
          >
            {cooldown > 0 ? `Kirim ulang (${cooldown} dtk)` : "Kirim ulang kode"}
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={pending}
            onClick={() => {
              setErrors({});
              setStep("phone");
            }}
          >
            Ganti nomor
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
