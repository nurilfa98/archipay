// Alur absen masuk / pulang di HP (halaman /attendance/check),
// BUSINESS-FLOW §18.5–18.7:
// 1. Ambil lokasi GPS → server mengirim lokasi terdekat & mode (masuk/pulang).
// 2. Pilih lokasi (otomatis bila ada yang dalam radius). Bila di luar radius,
//    terlambat, atau pulang cepat, form alasan muncul, beserta tombol
//    "Ajukan Sanggahan / Catatan Khusus".
// 3. Selfie dengan liveness, lalu kirim. Server menghitung ulang semuanya.

"use client";

import {
  CircleAlertIcon,
  LoaderCircleIcon,
  LocateFixedIcon,
  LogInIcon,
  LogOutIcon,
  MapPinIcon,
  MessageSquareWarningIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { getCheckContext, submitAttendance, type CheckContext, type CheckLocation } from "../check-actions";
import { formatMinutes } from "../schedule";
import { appendSelfie, SelfieCamera, type CapturedSelfie } from "./face-capture";

type Gps = { latitude: number; longitude: number; accuracy: number };
type Ready = Exclude<CheckContext, { mode: "done" }>;

export function CheckFlow() {
  const router = useRouter();
  const [gps, setGps] = useState<Gps | null>(null);
  const [context, setContext] = useState<CheckContext | null>(null);
  const [locating, setLocating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<CapturedSelfie | null>(null);
  const [showAppeal, setShowAppeal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  function locate() {
    if (!("geolocation" in navigator)) {
      notify.error("Perangkat ini tidak mendukung GPS.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        const result = await getCheckContext(next);
        setLocating(false);
        if (!result.success) {
          notify.error(result.message);
          return;
        }
        setGps(next);
        setContext(result.data);
        if (result.data.mode !== "done") {
          // Otomatis pilih lokasi terdekat yang masuk radius.
          setSelectedId(result.data.locations.find((location) => location.inRadius)?.id ?? null);
        }
      },
      (error) => {
        setLocating(false);
        notify.error(
          error.code === error.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Izinkan akses lokasi untuk situs ini di pengaturan browser."
            : "Lokasi belum terbaca. Coba lagi di tempat terbuka.",
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  if (!context) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <LocateFixedIcon className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {locating ? "Mengambil lokasi Anda..." : "Izinkan akses lokasi, lalu ambil lokasi Anda."}
        </p>
        <Button onClick={locate} disabled={locating}>
          {locating ? <LoaderCircleIcon className="animate-spin" /> : <LocateFixedIcon />}
          Ambil lokasi saya
        </Button>
      </div>
    );
  }

  if (context.mode === "done") {
    return <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">{context.message}</p>;
  }

  const ready: Ready = context;
  const selected = ready.locations.find((location) => location.id === selectedId) ?? null;
  const late =
    ready.mode === "in" && selected && selected.isWorkDay && selected.localMinutes > selected.start + selected.tolerance
      ? selected.localMinutes - selected.start
      : 0;
  const early =
    ready.mode === "out" && ready.record.isWorkDay && ready.record.localMinutes < ready.record.scheduleEnd
      ? ready.record.scheduleEnd - ready.record.localMinutes
      : 0;
  const outside = !!selected && !selected.inRadius;
  const hasReason = late > 0 || early > 0 || outside;

  function submit(formElement: HTMLFormElement) {
    if (!gps || !selected || !selfie) return;
    const formData = new FormData(formElement);
    formData.set("mode", ready.mode);
    formData.set("locationId", selected.id);
    formData.set("latitude", String(gps.latitude));
    formData.set("longitude", String(gps.longitude));
    formData.set("accuracy", String(gps.accuracy));
    appendSelfie(formData, selfie);
    startTransition(async () => {
      const result = await submitAttendance(formData);
      if (!result.success) {
        setErrors(result.fieldErrors ?? {});
        notify.error(result.message);
        return;
      }
      notify.success(result.data.message, {
        title: ready.mode === "in" ? "Absen masuk tercatat" : "Absen pulang tercatat",
      });
      router.push("/attendance");
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
      className="flex flex-col gap-6"
    >
      {ready.mode === "out" && (
        <p className="rounded-lg bg-muted/60 p-3 text-sm">
          Masuk pukul {ready.record.checkInClock} di {ready.record.checkInLocationName}. Jam pulang{" "}
          {formatMinutes(ready.record.scheduleEnd)}.
        </p>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="pick-location">
        <div className="flex items-center justify-between gap-2">
          <h2 id="pick-location" className="font-medium">
            1. Lokasi {ready.mode === "in" ? "masuk" : "pulang"}
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={locate} disabled={locating || pending}>
            {locating ? <LoaderCircleIcon className="animate-spin" /> : <LocateFixedIcon />}
            Perbarui lokasi
          </Button>
        </div>
        {gps && <p className="text-xs text-muted-foreground">Akurasi GPS ±{Math.round(gps.accuracy)} m</p>}
        <ul className="flex flex-col gap-2" role="radiogroup" aria-labelledby="pick-location">
          {ready.locations.slice(0, 6).map((location) => (
            <LocationChoice
              key={location.id}
              location={location}
              selected={location.id === selectedId}
              onSelect={() => setSelectedId(location.id)}
            />
          ))}
        </ul>
        {!ready.locations.some((location) => location.inRadius) && (
          <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
            Anda tidak berada di radius lokasi mana pun. Pilih lokasi tempat Anda bertugas hari ini dan isi alasannya.
          </p>
        )}
      </section>

      {selected && (
        <section className="flex flex-col gap-4" aria-label="Keterangan">
          {late > 0 && (
            <ReasonField
              name="lateReason"
              label={`Anda tercatat terlambat ${late} menit (jam masuk ${formatMinutes(selected.start)})`}
              description="Alasan terlambat (opsional)."
              errors={errors.lateReason}
            />
          )}
          {early > 0 && (
            <ReasonField
              name="earlyReason"
              label={`Pulang ${early} menit sebelum jam pulang`}
              description="Wajib diisi: alasan pulang lebih awal."
              required
              errors={errors.earlyReason}
            />
          )}
          {outside && (
            <ReasonField
              name="outsideReason"
              label={`Di luar radius ${selected.name} (${formatDistance(selected.distance)} dari titik, radius ${selected.radiusMeters} m)`}
              description="Wajib diisi: kenapa absen di luar lokasi. Absen tetap dicatat dan ditandai untuk review Owner."
              required
              errors={errors.outsideReason}
            />
          )}
          {(hasReason || showAppeal) &&
            (showAppeal ? (
              <ReasonField
                name="appealNote"
                label="Sanggahan / catatan khusus"
                description="Misal: banjir di jalan, sudah izin atasan. Dibaca Owner saat review bulanan."
                maxLength={1000}
                errors={errors.appealNote}
              />
            ) : (
              <Button type="button" variant="outline" className="self-start" onClick={() => setShowAppeal(true)}>
                <MessageSquareWarningIcon />
                Ajukan Sanggahan / Catatan Khusus
              </Button>
            ))}
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="take-selfie">
        <h2 id="take-selfie" className="font-medium">
          2. Selfie
        </h2>
        <SelfieCamera
          onChange={setSelfie}
          disabled={pending || !selected}
          idleText={selected ? "Hadap kamera di tempat terang, lalu kedipkan mata." : "Pilih lokasi dulu."}
        />
      </section>

      <Button type="submit" size="lg" disabled={!selected || !selfie || pending}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : ready.mode === "in" ? <LogInIcon /> : <LogOutIcon />}
        {pending ? "Mencocokkan wajah..." : ready.mode === "in" ? "Absen masuk" : "Absen pulang"}
      </Button>
    </form>
  );
}

function LocationChoice({
  location,
  selected,
  onSelect,
}: {
  location: CheckLocation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted",
          selected && "border-brand ring-2 ring-brand/20",
        )}
      >
        <MapPinIcon className={cn("size-5 shrink-0", selected ? "text-brand" : "text-muted-foreground")} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium break-words">{location.name}</span>
          <span className="text-sm text-muted-foreground">
            {formatDistance(location.distance)} dari titik · radius {location.radiusMeters} m
          </span>
        </span>
        <ToneBadge tone={location.inRadius ? "success" : "warning"}>
          {location.inRadius ? "Dalam radius" : "Di luar radius"}
        </ToneBadge>
      </button>
    </li>
  );
}

function ReasonField({
  name,
  label,
  description,
  required = false,
  maxLength = 500,
  errors,
}: {
  name: string;
  label: string;
  description: string;
  required?: boolean;
  maxLength?: number;
  errors?: string[];
}) {
  const error = errors?.[0];
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Textarea id={name} name={name} maxLength={maxLength} required={required} aria-invalid={!!error} rows={2} />
      <FieldDescription>{description}</FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} km` : `${meters} m`;
}
