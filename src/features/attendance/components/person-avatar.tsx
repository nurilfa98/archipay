// Avatar orang di daftar absensi: inisial; bila ada foto acuan wajah yang
// disetujui, berganti jadi foto itu. Foto dimuat malas (loading="lazy") agar
// daftar panjang tidak memicu puluhan permintaan sekaligus, dan bila gagal
// dimuat inisial tetap tampil. Fotonya lewat route berizin (attendance:view-all
// atau pemilik foto).

"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const DEFAULT_AVATAR_TONE = "bg-brand/10 text-brand ring-brand/20";

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export function PersonAvatar({
  name,
  photoId = null,
  className = DEFAULT_AVATAR_TONE,
  size = "lg",
}: {
  name: string;
  photoId?: string | null;
  className?: string; // warna latar, teks, dan cincin
  size?: "default" | "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Avatar size={size} className={cn("ring-2", className)}>
      <AvatarFallback className={cn("text-xs font-semibold", className)}>{initialsOf(name)}</AvatarFallback>
      {photoId && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- file privat lewat route berizin
        <img
          src={`/api/attendance/faces/${photoId}/photo`}
          alt={`Foto ${name}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full rounded-full object-cover object-[50%_30%]"
        />
      )}
    </Avatar>
  );
}
