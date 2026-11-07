// "Tambah banyak lokasi" (Owner & Admin HR): klik di peta untuk menambah
// baris, atau unggah file .xlsx/.csv dari template. Semua baris tampil sebagai
// pratinjau yang bisa diperbaiki, lalu disimpan sekaligus. Baris yang salah
// ditandai merah dengan alasannya (dari server); belum ada yang tersimpan
// sampai semua baris benar.

"use client";

import { DownloadIcon, LoaderCircleIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_TIMEZONES,
  LOCATION_IMPORT_MAX_ROWS,
  RADIUS_DEFAULT,
  RADIUS_MAX,
  RADIUS_MIN,
  type AttendanceTimezone,
} from "../constants";
import { formatCoordinates, parseCoordinates, timezoneForPoint } from "../geo";
import { readLocationFile, type DraftLocation } from "../import-file";
import { importLocations } from "../location-actions";
import { LocationMap, type MapPoint } from "./location-map";
import { PlaceSearch, UseMyLocationButton } from "./location-picker";

const TIMEZONE_ITEMS = ATTENDANCE_TIMEZONES.map((zone) => ({ value: zone.value, label: zone.label }));

// Dropdown zona waktu (shadcn Select), dipakai di pengaturan baris baru dan di tiap baris.
function TimezoneSelect({
  value,
  onChange,
  className,
}: {
  value: AttendanceTimezone;
  onChange: (value: AttendanceTimezone) => void;
  className?: string;
}) {
  return (
    <Select items={TIMEZONE_ITEMS} value={value} onValueChange={(next) => next && onChange(next as AttendanceTimezone)}>
      <SelectTrigger className={cn("w-full", className)} aria-label="Zona waktu">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIMEZONE_ITEMS.map((zone) => (
          <SelectItem key={zone.value} value={zone.value}>
            {zone.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BulkLocationsEditor({ projectNames }: { projectNames: string[] }) {
  const router = useRouter();
  const datalistId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<DraftLocation[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({});
  const [defaultRadius, setDefaultRadius] = useState(String(RADIUS_DEFAULT));
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    key: number;
  } | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [reading, setReading] = useState(false);
  const [pending, startTransition] = useTransition();

  const points: (MapPoint & { index: number })[] = rows.flatMap((row, index) => {
    const point = parseCoordinates(row.coordinates);
    const radius = Number(row.radius);
    return point
      ? [
          {
            ...point,
            radius: radius >= RADIUS_MIN && radius <= RADIUS_MAX ? radius : RADIUS_MIN,
            label: row.name,
            index,
          },
        ]
      : [];
  });

  function update(index: number, patch: Partial<DraftLocation>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setRowErrors((current) => {
      if (!current[index]) return current;
      const next = { ...current };
      delete next[index];
      return next;
    });
  }

  function addRow(point?: { lat: number; lng: number }) {
    if (rows.length >= LOCATION_IMPORT_MAX_ROWS) {
      notify.error(`Maksimal ${LOCATION_IMPORT_MAX_ROWS} lokasi sekali simpan.`);
      return;
    }
    setRows((current) => [
      ...current,
      {
        key: `new-${Date.now()}-${current.length}`,
        name: "",
        coordinates: point ? formatCoordinates(point) : "",
        radius: defaultRadius,
        // Zona waktu mengikuti koordinat (WIB / WITA / WIT); bisa diubah per baris.
        timezone: (point && timezoneForPoint(point)) || "Asia/Jakarta",
        projectName: "",
        workStart: "",
        workEnd: "",
      },
    ]);
    setSelected(rows.length);
    // Fokus ke isian nama baris baru setelah tampil.
    setTimeout(() => document.getElementById(`bulk-name-${rows.length}`)?.focus(), 50);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
    setRowErrors({});
    setSelected(null);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReading(true);
    try {
      const imported = await readLocationFile(file, {
        radius: defaultRadius,
        timezone: "Asia/Jakarta",
      });
      if (imported.length === 0) {
        notify.error("File tidak berisi baris lokasi.");
        return;
      }
      const total = rows.length + imported.length;
      if (total > LOCATION_IMPORT_MAX_ROWS) {
        notify.error(`Total ${total} baris melebihi batas ${LOCATION_IMPORT_MAX_ROWS} lokasi sekali simpan.`);
        return;
      }
      setRows((current) => [...current, ...imported]);
      setRowErrors({});
      setFitKey(Date.now());
      notify.success(`${imported.length} baris terbaca. Periksa pratinjau sebelum menyimpan.`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "File tidak bisa dibaca.");
    } finally {
      setReading(false);
    }
  }

  function save() {
    if (rows.length === 0) {
      notify.error("Belum ada lokasi. Klik peta atau unggah file.");
      return;
    }
    startTransition(async () => {
      const result = await importLocations(
        rows.map((row) => ({
          name: row.name,
          coordinates: row.coordinates,
          radiusMeters: row.radius,
          timezone: row.timezone,
          projectName: row.projectName,
          workStartMinute: row.workStart,
          workEndMinute: row.workEnd,
        })),
      );
      if (!result.success) {
        setRowErrors(result.fieldErrors ?? {});
        notify.error(result.message);
        return;
      }
      notify.success(`${result.data.count} lokasi langsung bisa dipakai absen.`, { title: "Lokasi tersimpan" });
      router.push("/attendance/locations");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-medium">Dari file Excel</h2>
        <p className="text-sm text-muted-foreground">
          Isi template (satu lokasi per baris), lalu unggah. Koordinat boleh kosong dan dipilih di peta nanti.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href="/api/attendance/locations/template" download />}
          >
            <DownloadIcon />
            Unduh template
          </Button>
          <Button type="button" onClick={() => fileRef.current?.click()} disabled={reading}>
            {reading ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />}
            Unggah file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-medium">Dari peta</h2>
        <p className="text-sm text-muted-foreground">
          Klik peta untuk menambah baris. Klik pin untuk memilih baris, geser pin untuk memindahkan titik.
        </p>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
          <div className="flex-1">
            <PlaceSearch onPick={(point) => setFocus({ ...point, zoom: 17, key: Date.now() })} />
          </div>
          <UseMyLocationButton onLocate={(point) => addRow(point)} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            Radius baris baru
            <Input
              type="number"
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              value={defaultRadius}
              onChange={(event) => setDefaultRadius(event.target.value)}
              className="h-8 w-24 tabular-nums"
            />
            m
          </label>
        </div>
        <LocationMap
          points={points}
          selectedIndex={selected === null ? null : points.findIndex((point) => point.index === selected)}
          focus={focus}
          fitKey={fitKey}
          onMapClick={(point) => addRow(point)}
          onPointMove={(pointIndex, point) =>
            update(points[pointIndex].index, {
              coordinates: formatCoordinates(point),
              ...zoneFor(point),
            })
          }
          onPointSelect={(pointIndex) => {
            const index = points[pointIndex].index;
            setSelected(index);
            document.getElementById(`bulk-row-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Pratinjau ({rows.length} lokasi)</h2>
          <Button type="button" variant="brand-outline" size="sm" onClick={() => addRow()}>
            <PlusIcon />
            Baris kosong
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Belum ada lokasi. Klik peta atau unggah file.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => {
              const errors = rowErrors[index];
              return (
                <li
                  key={row.key}
                  id={`bulk-row-${index}`}
                  className={cn(
                    "rounded-lg border p-3",
                    selected === index && "border-brand ring-2 ring-brand/20",
                    errors && "border-destructive bg-destructive/5",
                  )}
                  onFocus={() => setSelected(index)}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Baris {index + 1}</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      aria-label={`Hapus baris ${index + 1}`}
                      title="Hapus baris"
                      onClick={() => removeRow(index)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SmallField label="Nama lokasi" className="lg:col-span-2">
                      <Input
                        id={`bulk-name-${index}`}
                        value={row.name}
                        maxLength={100}
                        placeholder="Misal: Proyek Rumah Bintaro"
                        onChange={(event) => update(index, { name: event.target.value })}
                      />
                    </SmallField>
                    <SmallField label="Koordinat" className="lg:col-span-2">
                      <Input
                        value={row.coordinates}
                        placeholder="Klik peta atau tempel koordinat"
                        inputMode="decimal"
                        className="tabular-nums"
                        onChange={(event) =>
                          update(index, {
                            coordinates: event.target.value,
                            ...zoneFor(parseCoordinates(event.target.value)),
                          })
                        }
                      />
                    </SmallField>
                    <SmallField label="Radius (m)">
                      <Input
                        type="number"
                        min={RADIUS_MIN}
                        max={RADIUS_MAX}
                        value={row.radius}
                        className="tabular-nums"
                        onChange={(event) => update(index, { radius: event.target.value })}
                      />
                    </SmallField>
                    <SmallField label="Zona waktu (otomatis)">
                      <TimezoneSelect value={row.timezone} onChange={(timezone) => update(index, { timezone })} />
                    </SmallField>
                    <SmallField label="Proyek (opsional)">
                      <Input
                        value={row.projectName}
                        list={datalistId}
                        placeholder="Nama proyek"
                        onChange={(event) => update(index, { projectName: event.target.value })}
                      />
                    </SmallField>
                    <div className="grid grid-cols-2 gap-2">
                      <SmallField label="Jam masuk">
                        <Input
                          type="time"
                          value={row.workStart}
                          onChange={(event) => update(index, { workStart: event.target.value })}
                        />
                      </SmallField>
                      <SmallField label="Jam pulang">
                        <Input
                          type="time"
                          value={row.workEnd}
                          onChange={(event) => update(index, { workEnd: event.target.value })}
                        />
                      </SmallField>
                    </div>
                  </div>
                  {errors && (
                    <ul className="mt-2 list-inside list-disc text-sm text-destructive">
                      {errors.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <datalist id={datalistId}>
          {projectNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <p className="text-sm text-muted-foreground">
          Jam kosong = ikut jam kerja perusahaan. Nama lokasi tidak boleh sama dengan yang sudah ada.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save} disabled={pending || rows.length === 0}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : `Simpan ${rows.length} lokasi`}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/attendance/locations" />}>
            Batal
          </Button>
        </div>
      </section>
    </div>
  );
}

// Zona waktu baris mengikuti koordinat bila koordinatnya valid dan di Indonesia.
function zoneFor(point: { lat: number; lng: number } | null): { timezone?: AttendanceTimezone } {
  const timezone = point ? timezoneForPoint(point) : null;
  return timezone ? { timezone } : {};
}

function SmallField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    // Hanya teks labelnya yang abu-abu; isian di dalamnya memakai warna teks biasa.
    <label className={cn("flex flex-col gap-1 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
