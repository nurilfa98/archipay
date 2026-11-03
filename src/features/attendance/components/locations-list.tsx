// Daftar lokasi absensi: pencarian langsung di browser, peta semua lokasi
// aktif, dan kartu per lokasi. Owner & Admin HR bisa mengubah dan
// mengaktifkan/menonaktifkan; Superadmin hanya melihat (readOnly).

"use client";

import { ExternalLinkIcon, LoaderCircleIcon, MapPinIcon, PencilIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useId, useOptimistic, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { timezoneLabel } from "../constants";
import { mapLink } from "../geo";
import { setLocationActive } from "../location-actions";
import type { AttendanceLocation } from "../queries";
import { formatMinutes } from "../schedule";
import { LocationMap } from "./location-map";

export function LocationsList({
  locations,
  companyHours,
  readOnly,
}: {
  locations: AttendanceLocation[];
  companyHours: { start: number; end: number };
  readOnly: boolean;
}) {
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = locations.filter((location) => {
    const text = `${location.name} ${location.projectName ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const active = locations.filter((location) => location.isActive);

  if (locations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Belum ada lokasi absensi. {readOnly ? "" : "Tambahkan kantor, cabang, atau lokasi proyek."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <LocationMap
        points={active.map((location) => ({
          lat: location.latitude,
          lng: location.longitude,
          radius: location.radiusMeters,
          label: location.name,
        }))}
        className="h-64 sm:h-80"
      />
      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Cari lokasi"
          placeholder="Cari nama lokasi atau project"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-8"
        />
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Lokasi &quot;{query}&quot; tidak ditemukan.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((location) => (
            <li
              key={location.id}
              className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", !location.isActive && "opacity-70")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-brand" />
                  <div className="min-w-0">
                    <p className="font-medium break-words">{location.name}</p>
                    <p className="text-sm text-muted-foreground">{location.projectName ?? "Tanpa project"}</p>
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    variant="edit"
                    size="icon-sm"
                    nativeButton={false}
                    aria-label={`Ubah ${location.name}`}
                    title="Ubah lokasi"
                    render={<Link href={`/attendance/locations/${location.id}/edit`} />}
                  >
                    <PencilIcon />
                  </Button>
                )}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Radius</dt>
                  <dd className="tabular-nums">{location.radiusMeters.toLocaleString("id-ID")} m</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Jam kerja</dt>
                  <dd className="tabular-nums">
                    {formatMinutes(location.workStartMinute ?? companyHours.start)}–
                    {formatMinutes(location.workEndMinute ?? companyHours.end)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Zona</dt>
                  <dd>{timezoneLabel(location.timezone)}</dd>
                </div>
              </dl>
              <div className="flex items-center justify-between gap-2">
                <LocationActiveSwitch location={location} readOnly={readOnly} />
                <a
                  href={mapLink({
                    lat: location.latitude,
                    lng: location.longitude,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                >
                  Buka di peta
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Mengaktifkan langsung disimpan; menonaktifkan minta konfirmasi (lokasi
// hilang dari pilihan absen). Polanya sama dengan saklar kategori biaya.
function LocationActiveSwitch({ location, readOnly }: { location: AttendanceLocation; readOnly: boolean }) {
  const labelId = useId();
  const [pending, startTransition] = useTransition();
  const [optimisticActive, setOptimisticActive] = useOptimistic(location.isActive);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function save(next: boolean) {
    startTransition(async () => {
      setOptimisticActive(next);
      const result = await setLocationActive(location.id, next);
      if (result.success) {
        setConfirmOpen(false);
        notify.success(next ? `"${location.name}" diaktifkan.` : `"${location.name}" dinonaktifkan.`);
      } else {
        notify.error(result.message);
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          checked={optimisticActive}
          onCheckedChange={(next) => (next ? save(true) : setConfirmOpen(true))}
          disabled={pending || readOnly}
          aria-labelledby={labelId}
          className="data-checked:bg-emerald-600 dark:data-checked:bg-emerald-500"
        />
        <span id={labelId} className={cn("text-sm", optimisticActive ? "font-medium" : "text-muted-foreground")}>
          <span className="sr-only">Status {location.name}: </span>
          {optimisticActive ? "Aktif" : "Nonaktif"}
        </span>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan &quot;{location.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Lokasi tidak bisa dipilih lagi saat absen. Riwayat absen di lokasi ini tetap tersimpan, dan lokasi bisa
              diaktifkan lagi kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => save(false)}>
              {pending && <LoaderCircleIcon className="animate-spin" />}
              Nonaktifkan
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
