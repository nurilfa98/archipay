// Form satu lokasi absensi (Owner & Admin HR) untuk dua halaman:
// - /attendance/locations/new        : tambah lokasi
// - /attendance/locations/[id]/edit  : ubah lokasi (`location` diisi)
//
// Titik dipilih lewat peta (klik / geser pin), cari alamat, GPS perangkat,
// atau menempel koordinat. Memakai onSubmit + startTransition agar isian tidak
// hilang saat validasi gagal (lihat features/projects/components/project-form.tsx).

"use client";

import { LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";
import { ATTENDANCE_TIMEZONES, RADIUS_DEFAULT, RADIUS_MAX, RADIUS_MIN, RADIUS_RECOMMENDED_MIN } from "../constants";
import { formatCoordinates, parseCoordinates, type LatLng } from "../geo";
import { createLocation, updateLocation } from "../location-actions";
import type { AttendanceLocation, ProjectOption } from "../queries";
import { formatMinutes, minutesToTimeInput } from "../schedule";
import { LocationMap } from "./location-map";
import { PlaceSearch, UseMyLocationButton } from "./location-picker";

export function LocationForm({
  location,
  projects,
  companyHours,
}: {
  location?: AttendanceLocation;
  projects: ProjectOption[];
  companyHours: { start: number; end: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  const initialPoint = location ? { lat: location.latitude, lng: location.longitude } : null;
  const [point, setPoint] = useState<LatLng | null>(initialPoint);
  const [coordinateText, setCoordinateText] = useState(initialPoint ? formatCoordinates(initialPoint) : "");
  const [radius, setRadius] = useState(String(location?.radiusMeters ?? RADIUS_DEFAULT));
  const [focus, setFocus] = useState<(LatLng & { zoom?: number; key: number }) | null>(null);
  const [customHours, setCustomHours] = useState(location?.workStartMinute != null);

  const radiusNumber = Number(radius);
  const smallRadius =
    Number.isFinite(radiusNumber) && radiusNumber >= RADIUS_MIN && radiusNumber < RADIUS_RECOMMENDED_MIN;
  const backHref = "/attendance/locations";

  const projectItems = [
    { value: "none", label: "Tanpa project" },
    ...projects.map((project) => ({
      value: project.id,
      label: project.isActive ? project.name : `${project.name} (selesai)`,
    })),
  ];
  const timezoneItems = ATTENDANCE_TIMEZONES.map((zone) => ({
    value: zone.value,
    label: zone.description,
  }));

  function movePoint(next: LatLng, zoom?: number) {
    setPoint(next);
    setCoordinateText(formatCoordinates(next));
    if (zoom) setFocus({ ...next, zoom, key: Date.now() });
  }

  function handleCoordinateBlur() {
    const parsed = parseCoordinates(coordinateText);
    if (parsed) movePoint(parsed, 17);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = location ? await updateLocation(location.id, formData) : await createLocation(formData);
      if (!result.success) {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      notify.success(location ? "Perubahan lokasi tersimpan." : "Lokasi baru langsung bisa dipakai absen.", {
        title: location ? "Lokasi diperbarui" : "Lokasi ditambahkan",
      });
      router.push(backHref);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!fieldError("name")}>
            <FieldLabel htmlFor="name">Nama lokasi</FieldLabel>
            <Input
              id="name"
              name="name"
              defaultValue={location?.name}
              placeholder="Misal: Kantor Pusat, Proyek Rumah Bintaro"
              maxLength={100}
              aria-invalid={!!fieldError("name")}
              required
            />
            <FieldError>{fieldError("name")}</FieldError>
          </Field>
          <Field data-invalid={!!fieldError("projectId")}>
            <FieldLabel htmlFor="projectId">Project (opsional)</FieldLabel>
            <Select name="projectId" items={projectItems} defaultValue={location?.projectId ?? "none"}>
              <SelectTrigger id="projectId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Untuk lokasi proyek. Kantor atau gudang cukup tanpa project.</FieldDescription>
            <FieldError>{fieldError("projectId")}</FieldError>
          </Field>
        </div>

        <FieldSet>
          <FieldLegend variant="label">Titik lokasi</FieldLegend>
          <FieldDescription>
            Cari alamat, tekan &quot;Pakai lokasi saya sekarang&quot; saat berada di lokasi (paling akurat untuk lahan
            proyek), atau klik peta. Pin bisa digeser.
          </FieldDescription>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
              <div className="flex-1">
                <PlaceSearch onPick={(next) => movePoint(next, 17)} />
              </div>
              <UseMyLocationButton
                onLocate={(next, accuracy) => {
                  movePoint(next, 18);
                  if (accuracy > 50) {
                    notify.error(`Akurasi GPS ±${Math.round(accuracy)} m. Periksa lagi posisi pin di peta.`);
                  }
                }}
              />
            </div>
            <LocationMap
              points={
                point
                  ? [
                      {
                        ...point,
                        radius: radiusNumber >= RADIUS_MIN ? radiusNumber : RADIUS_MIN,
                      },
                    ]
                  : []
              }
              focus={focus}
              onMapClick={(next) => movePoint(next)}
              onPointMove={(_index, next) => movePoint(next)}
            />
            <Field data-invalid={!!fieldError("coordinates")}>
              <FieldLabel htmlFor="coordinates">Koordinat</FieldLabel>
              <Input
                id="coordinates"
                name="coordinates"
                value={coordinateText}
                onChange={(event) => setCoordinateText(event.target.value)}
                onBlur={handleCoordinateBlur}
                placeholder="-6.27181, 106.71335"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
                aria-invalid={!!fieldError("coordinates")}
                required
              />
              <FieldDescription>Terisi otomatis dari peta. Bisa juga ditempel dari Google Maps.</FieldDescription>
              <FieldError>{fieldError("coordinates")}</FieldError>
            </Field>
          </div>
        </FieldSet>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!fieldError("radiusMeters")}>
            <FieldLabel htmlFor="radiusMeters">Radius absen</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="radiusMeters"
                name="radiusMeters"
                type="number"
                inputMode="numeric"
                min={RADIUS_MIN}
                max={RADIUS_MAX}
                value={radius}
                onChange={(event) => setRadius(event.target.value)}
                className="w-28 tabular-nums"
                aria-invalid={!!fieldError("radiusMeters")}
                required
              />
              <span className="text-sm text-muted-foreground">meter</span>
            </div>
            {smallRadius ? (
              <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                GPS HP bisa meleset 5–20 m. Disarankan minimal {RADIUS_RECOMMENDED_MIN} m agar karyawan yang sudah di
                lokasi tidak tertolak.
              </p>
            ) : (
              <FieldDescription>
                Karyawan di dalam lingkaran ini dianggap berada di lokasi ({RADIUS_MIN}–
                {RADIUS_MAX.toLocaleString("id-ID")} m).
              </FieldDescription>
            )}
            <FieldError>{fieldError("radiusMeters")}</FieldError>
          </Field>
          <Field data-invalid={!!fieldError("timezone")}>
            <FieldLabel htmlFor="timezone">Zona waktu</FieldLabel>
            <Select name="timezone" items={timezoneItems} defaultValue={location?.timezone ?? "Asia/Jakarta"}>
              <SelectTrigger id="timezone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezoneItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Jam absen di lokasi ini dihitung menurut zona waktu ini.</FieldDescription>
            <FieldError>{fieldError("timezone")}</FieldError>
          </Field>
        </div>

        <FieldSet>
          <Field orientation="horizontal">
            <Checkbox
              id="customHours"
              name="customHours"
              checked={customHours}
              onCheckedChange={(checked) => setCustomHours(checked)}
            />
            <FieldLabel htmlFor="customHours" className="font-normal">
              Jam kerja khusus lokasi ini
            </FieldLabel>
          </Field>
          {customHours ? (
            <div className="grid max-w-md gap-5 sm:grid-cols-2">
              <TimeField
                name="workStart"
                label="Jam masuk"
                defaultValue={minutesToTimeInput(location?.workStartMinute ?? companyHours.start)}
                error={fieldError("workStartMinute")}
              />
              <TimeField
                name="workEnd"
                label="Jam pulang"
                defaultValue={minutesToTimeInput(location?.workEndMinute ?? companyHours.end)}
                error={fieldError("workEndMinute")}
              />
            </div>
          ) : (
            <FieldDescription>
              Ikut jam kerja company: {formatMinutes(companyHours.start)} – {formatMinutes(companyHours.end)}.
            </FieldDescription>
          )}
        </FieldSet>

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href={backHref} />}>
            Batal
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

export function TimeField({
  name,
  label,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  defaultValue: string;
  error?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        type="time"
        defaultValue={defaultValue}
        className="w-32 tabular-nums"
        aria-invalid={!!error}
        required
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}
