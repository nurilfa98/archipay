// Alat bantu memilih titik di peta: cari alamat (Nominatim lewat Server
// Action) dan "Pakai lokasi saya sekarang" (GPS HP/laptop). Owner/Admin HR
// tidak perlu membuka Google Maps.

"use client";

import { LoaderCircleIcon, LocateFixedIcon, SearchIcon } from "lucide-react";
import { useState, useTransition, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { searchPlaces, type PlaceResult } from "../location-actions";
import { roundCoordinate, type LatLng } from "../geo";

export function PlaceSearch({ onPick }: { onPick: (point: LatLng) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    if (query.trim().length < 3) {
      notify.error("Ketik minimal 3 huruf nama tempat atau alamat.");
      return;
    }
    startTransition(async () => {
      const result = await searchPlaces(query);
      if (!result.success) {
        notify.error(result.message);
        return;
      }
      setResults(result.data);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter mencari alamat, bukan mengirim form lokasi.
    if (event.key === "Enter") {
      event.preventDefault();
      search();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="search"
          aria-label="Cari alamat"
          placeholder="Cari alamat, misal: Jl. Sudirman Jakarta"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button type="button" variant="outline" onClick={search} disabled={pending}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <SearchIcon />}
          Cari
        </Button>
      </div>
      {results && (
        <div className="rounded-lg border text-sm">
          {results.length === 0 ? (
            <p className="p-3 text-muted-foreground">
              Alamat tidak ditemukan. Coba kata kunci lain, atau geser pin di peta secara manual.
            </p>
          ) : (
            <ul className="divide-y">
              {results.map((place) => (
                <li key={`${place.lat},${place.lng}`}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      onPick({
                        lat: roundCoordinate(place.lat),
                        lng: roundCoordinate(place.lng),
                      });
                      setResults(null);
                    }}
                  >
                    {place.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            Data alamat OpenStreetMap belum selengkap Google untuk gang & perumahan baru. Setelah memilih, geser pin ke
            titik yang tepat.
          </p>
        </div>
      )}
    </div>
  );
}

export function UseMyLocationButton({ onLocate }: { onLocate: (point: LatLng, accuracy: number) => void }) {
  const [locating, setLocating] = useState(false);

  function locate() {
    if (!("geolocation" in navigator)) {
      notify.error("Perangkat ini tidak mendukung GPS.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onLocate(
          {
            lat: roundCoordinate(position.coords.latitude),
            lng: roundCoordinate(position.coords.longitude),
          },
          position.coords.accuracy,
        );
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

  return (
    <Button type="button" variant="outline" onClick={locate} disabled={locating}>
      {locating ? <LoaderCircleIcon className="animate-spin" /> : <LocateFixedIcon />}
      Pakai lokasi saya sekarang
    </Button>
  );
}
