// Daftar absen (Server Component): riwayat milik sendiri di menu Absensi dan
// daftar semua orang di /attendance/today. Jam ditampilkan dalam zona waktu
// lokasi absen.
//
// Selfie absen tidak disimpan, dan skor cocok wajah tidak ditampilkan di daftar ini.
// Skor 0 = absen hasil koreksi Owner (tanpa cocok wajah): diberi tanda "Koreksi Owner".

import { CalendarDaysIcon, ExternalLinkIcon, LogInIcon, LogOutIcon, MapPinIcon } from "lucide-react";
import { ToneBadge } from "@/components/tone-badge";
import { formatDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatLocalClock } from "../clock";
import { timezoneLabel } from "../constants";
import { mapLink } from "../geo";
import type { AttendanceRecordRow } from "../queries";
import { dayTags } from "../status";
import { PersonAvatar } from "./person-avatar";

export function RecordList({
  records,
  names,
  photos,
  now,
  emptyText,
}: {
  records: AttendanceRecordRow[];
  // Diisi pada daftar semua orang: userId → nama.
  names?: Map<string, string>;
  // userId → id foto acuan yang disetujui (avatar); tanpa itu avatar berisi inisial.
  photos?: Map<string, string>;
  now: Date;
  emptyText: string;
}) {
  if (records.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {records.map((record) => {
        const name = names?.get(record.userId);
        return (
          <li key={record.id} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-start gap-3 p-3 sm:p-4">
              {name ? (
                <PersonAvatar name={name} photoId={photos?.get(record.userId) ?? null} />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <CalendarDaysIcon className="size-5" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{name ?? formatDateOnly(record.workDate)}</p>
                  {name && <p className="text-sm text-muted-foreground">{formatDateOnly(record.workDate)}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {dayTags(record, now).map((tag) => (
                    <ToneBadge key={tag.label} tone={tag.tone}>
                      {tag.label}
                    </ToneBadge>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid divide-y border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <CheckSide
                kind="in"
                title="Masuk"
                at={record.checkInAt}
                timezone={record.timezone}
                locationName={record.checkInLocationName}
                distance={record.checkInDistance}
                point={{ lat: record.checkInLatitude, lng: record.checkInLongitude }}
                faceScore={record.checkInFaceScore}
                notes={[
                  record.lateReason && `Alasan terlambat: ${record.lateReason}`,
                  record.checkInOutsideReason && `Alasan di luar radius: ${record.checkInOutsideReason}`,
                ]}
              />
              {record.checkOutAt ? (
                <CheckSide
                  kind="out"
                  title="Pulang"
                  at={record.checkOutAt}
                  timezone={record.timezone}
                  locationName={record.checkOutLocationName ?? "-"}
                  distance={record.checkOutDistance ?? 0}
                  point={{ lat: record.checkOutLatitude ?? 0, lng: record.checkOutLongitude ?? 0 }}
                  faceScore={record.checkOutFaceScore ?? 0}
                  notes={[
                    record.earlyReason && `Alasan pulang cepat: ${record.earlyReason}`,
                    record.checkOutOutsideReason && `Alasan di luar radius: ${record.checkOutOutsideReason}`,
                  ]}
                />
              ) : (
                <div className="flex items-center gap-3 p-3 sm:p-4">
                  <IconTile kind="out" muted />
                  <div className="text-sm">
                    <p className="font-medium">Pulang</p>
                    <p className="text-muted-foreground">Belum absen pulang.</p>
                  </div>
                </div>
              )}
            </div>

            {(record.correctionNote || record.appealNote) && (
              <div className="flex flex-col gap-2 border-t p-3 sm:p-4">
                {record.correctionNote && (
                  <p className="rounded-md bg-indigo-50 p-2 text-sm text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                    <span className="font-medium">Dikoreksi Owner:</span> {record.correctionNote}
                  </p>
                )}
                {record.appealNote && (
                  <p className="rounded-md bg-amber-50 p-2 text-sm whitespace-pre-line text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <span className="font-medium">Sanggahan / catatan khusus:</span> {record.appealNote}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Ikon bulat masuk (hijau) / pulang (indigo); redup bila belum ada.
function IconTile({ kind, muted = false }: { kind: "in" | "out"; muted?: boolean }) {
  const Icon = kind === "in" ? LogInIcon : LogOutIcon;
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full",
        muted
          ? "bg-muted text-muted-foreground"
          : kind === "in"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

function CheckSide({
  kind,
  title,
  at,
  timezone,
  locationName,
  distance,
  point,
  faceScore,
  notes,
}: {
  kind: "in" | "out";
  title: string;
  at: Date;
  timezone: string;
  locationName: string;
  distance: number;
  point: { lat: number; lng: number };
  faceScore: number;
  notes: (string | null | false)[];
}) {
  return (
    <div className="flex gap-3 p-3 sm:p-4">
      <IconTile kind={kind} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{title}</span>
          <span className="text-lg leading-none font-semibold tabular-nums">{formatLocalClock(at, timezone)}</span>
          <span className="text-xs text-muted-foreground">{timezoneLabel(timezone)}</span>
        </p>
        <p className="flex items-start gap-1 text-muted-foreground">
          <MapPinIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">
            {locationName} · {distance} m{" "}
            <a href={mapLink(point)} target="_blank" rel="noreferrer" className="inline-flex items-center text-brand">
              peta
              <ExternalLinkIcon className="ml-0.5 size-3" />
            </a>
          </span>
        </p>
        {/* Skor cocok wajah tidak ditampilkan; skor 0 = absen hasil koreksi Owner (tanpa cocok wajah). */}
        {faceScore === 0 && (
          <div>
            <ToneBadge tone="pending">Koreksi Owner</ToneBadge>
          </div>
        )}
        {notes.filter(Boolean).map((note) => (
          <p key={String(note)} className="text-muted-foreground">
            {note}
          </p>
        ))}
      </div>
    </div>
  );
}
