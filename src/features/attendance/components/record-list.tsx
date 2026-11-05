// Daftar absen (Server Component): riwayat milik sendiri di menu Absensi dan
// daftar semua orang di /attendance/today. Jam ditampilkan dalam zona waktu
// lokasi absen.
//
// Selfie absen tidak disimpan: yang tampil adalah hasil cocok wajah (skor).
// Skor 0 = absen hasil koreksi Owner (tanpa cocok wajah).

import { ExternalLinkIcon, ScanFaceIcon } from "lucide-react";
import { ToneBadge } from "@/components/tone-badge";
import { formatDateOnly } from "@/lib/dates";
import { formatLocalClock } from "../clock";
import { timezoneLabel } from "../constants";
import { mapLink } from "../geo";
import type { AttendanceRecordRow } from "../queries";
import { dayTags } from "../status";

export function RecordList({
  records,
  names,
  now,
  emptyText,
}: {
  records: AttendanceRecordRow[];
  // Diisi pada daftar semua orang: userId → nama.
  names?: Map<string, string>;
  now: Date;
  emptyText: string;
}) {
  if (records.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {records.map((record) => (
        <li key={record.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{names?.get(record.userId) ?? formatDateOnly(record.workDate)}</p>
              {names && <p className="text-sm text-muted-foreground">{formatDateOnly(record.workDate)}</p>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dayTags(record, now).map((tag) => (
                <ToneBadge key={tag.label} tone={tag.tone}>
                  {tag.label}
                </ToneBadge>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckSide
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
              <p className="text-sm text-muted-foreground">Belum absen pulang.</p>
            )}
          </div>
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
        </li>
      ))}
    </ul>
  );
}

function CheckSide({
  title,
  at,
  timezone,
  locationName,
  distance,
  point,
  faceScore,
  notes,
}: {
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
    <div className="flex gap-3">
      {faceScore > 0 ? (
        <div className="flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-emerald-50 text-center text-[10px] leading-tight text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <ScanFaceIcon className="size-5" />
          Wajah cocok
          <span className="tabular-nums">{faceScore}%</span>
        </div>
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted text-center text-[10px] text-muted-foreground">
          Koreksi Owner
        </div>
      )}
      <div className="min-w-0 text-sm">
        <p>
          <span className="font-medium">
            {title} {formatLocalClock(at, timezone)}
          </span>{" "}
          <span className="text-muted-foreground">{timezoneLabel(timezone)}</span>
        </p>
        <p className="text-muted-foreground">
          {locationName} · {distance} m{" "}
          <a href={mapLink(point)} target="_blank" rel="noreferrer" className="inline-flex items-center text-brand">
            peta
            <ExternalLinkIcon className="ml-0.5 size-3" />
          </a>
        </p>
        {notes.filter(Boolean).map((note) => (
          <p key={String(note)} className="text-muted-foreground">
            {note}
          </p>
        ))}
      </div>
    </div>
  );
}
