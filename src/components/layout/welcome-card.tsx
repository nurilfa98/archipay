// Kartu sapaan di halaman / (tepat setelah login): "Selamat pagi, Nuril",
// hari + tanggal, dan jam digital (HH:MM + WIB/WITA/WIT) yang berjalan sendiri.
//
// Client Component karena jam berjalan di browser. Waktu SELALU dibaca dari
// `timeZone` perusahaan (APP_TIMEZONE, dikirim dari server), bukan zona waktu
// perangkat, sama dengan tanggal di bagian lain aplikasi.
//
// Hydration: render pertama (server dan browser) belum memakai waktu sama sekali
// (`now` = null → "Halo" + penanda jam kosong; useSyncExternalStore memakai
// snapshot server), baru setelah terpasang jam dan sapaan sesuai waktu muncul. Dengan begitu tidak ada beda HTML antara
// server dan browser, dan jam tidak "membeku" di hasil prerender.
//
// Sapaan menurut jam setempat: pagi 05.00–10.59, siang 11.00–14.59,
// sore 15.00–17.59, malam 18.00–04.59.

"use client";

import { MoonStarIcon, SunIcon, SunMediumIcon, SunsetIcon, type LucideIcon } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type Period = "pagi" | "siang" | "sore" | "malam";

const PERIODS: Record<Period, { label: string; icon: LucideIcon; card: string; iconColor: string }> = {
  pagi: {
    label: "Selamat pagi",
    icon: SunMediumIcon,
    card: "from-amber-100 via-orange-50 to-sky-100 dark:from-amber-950/50 dark:via-slate-900 dark:to-sky-950/40",
    iconColor: "text-amber-500",
  },
  siang: {
    label: "Selamat siang",
    icon: SunIcon,
    card: "from-sky-100 via-cyan-50 to-yellow-100 dark:from-sky-950/60 dark:via-slate-900 dark:to-yellow-950/30",
    iconColor: "text-yellow-500",
  },
  sore: {
    label: "Selamat sore",
    icon: SunsetIcon,
    card: "from-orange-100 via-rose-50 to-violet-100 dark:from-orange-950/50 dark:via-rose-950/30 dark:to-violet-950/40",
    iconColor: "text-orange-500",
  },
  malam: {
    label: "Selamat malam",
    icon: MoonStarIcon,
    card: "from-indigo-100 via-slate-100 to-violet-100 dark:from-indigo-950/70 dark:via-slate-950 dark:to-violet-950/50",
    iconColor: "text-indigo-500 dark:text-indigo-300",
  },
};

function periodOf(hour: number): Period {
  if (hour >= 5 && hour < 11) return "pagi";
  if (hour >= 11 && hour < 15) return "siang";
  if (hour >= 15 && hour < 18) return "sore";
  return "malam";
}

// Detik saat ini dari jam perangkat, diperbarui tiap detik. Di server (dan
// render hidrasi pertama) nilainya null: jam belum dipakai sama sekali.
function subscribeToClock(onTick: () => void) {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}
const clockSeconds = () => Math.floor(Date.now() / 1000);
const noClock = () => null;

export function WelcomeCard({ name, timeZone }: { name: string; timeZone: string }) {
  const seconds = useSyncExternalStore<number | null>(subscribeToClock, clockSeconds, noClock);
  const now = seconds === null ? null : new Date(seconds * 1000);

  const formats = useMemo(
    () => ({
      time: new Intl.DateTimeFormat("id-ID", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      zone: new Intl.DateTimeFormat("id-ID", { timeZone, timeZoneName: "short" }),
      date: new Intl.DateTimeFormat("id-ID", {
        timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    }),
    [timeZone],
  );

  const parts = now ? formats.time.formatToParts(now) : null;
  const hour = parts?.find((part) => part.type === "hour")?.value;
  const minute = parts?.find((part) => part.type === "minute")?.value;
  const zone = now ? formats.zone.formatToParts(now).find((part) => part.type === "timeZoneName")?.value : null;
  const period = hour ? PERIODS[periodOf(Number(hour))] : null;
  const Icon = period?.icon ?? SunIcon;
  // Titik dua berkedip tiap detik.
  const colonVisible = !now || now.getSeconds() % 2 === 0;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-linear-to-br p-5 shadow-xs sm:p-7",
        period?.card ?? "from-muted via-card to-muted",
      )}
    >
      {/* Ikon besar sebagai hiasan latar */}
      <Icon
        aria-hidden
        className={cn("pointer-events-none absolute -top-6 -right-6 size-40 opacity-20 sm:size-52", period?.iconColor)}
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-muted-foreground">{now ? formats.date.format(now) : " "}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {period ? `${period.label}, ${name}` : `Halo, ${name}`}
          </h1>
          <p className="text-sm text-muted-foreground">Pilih menu untuk mulai bekerja.</p>
        </div>

        <div
          className="flex items-baseline gap-2 rounded-2xl bg-background/60 px-4 py-2 backdrop-blur-sm sm:self-end"
          role="timer"
          aria-label={hour ? `Pukul ${hour}.${minute} ${zone ?? ""}` : "Jam"}
        >
          <span className="text-4xl leading-none font-semibold tracking-tight tabular-nums sm:text-5xl">
            {hour ?? "--"}
            <span className={cn("transition-opacity", colonVisible ? "opacity-100" : "opacity-30")}>:</span>
            {minute ?? "--"}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">{zone ?? ""}</span>
        </div>
      </div>
    </section>
  );
}

export function WelcomeCardSkeleton() {
  return <div className="h-44 animate-pulse rounded-3xl border bg-muted sm:h-40" aria-hidden />;
}
