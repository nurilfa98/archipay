// Baris pintasan bagian di halaman Pengaturan (menempel di atas). Kapsul bagian yang sedang
// tampil di layar ditandai aktif (gaya sama dengan saat disorot), mengikuti gulir halaman dan
// klik pada kapsul. Bagian dicari lewat id-nya (SettingsSection).

"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Sebuah bagian dianggap aktif setelah tepi atasnya naik melewati garis ini (px dari atas layar),
// sedikit di bawah tinggi navbar + baris pintasan (SettingsSection memakai scroll-mt-32 = 128 px).
const ACTIVE_LINE = 140;
// Setelah klik, hitungan dari gulir ditahan sebentar agar pilihan klik tidak berpindah-pindah.
const CLICK_LOCK_MS = 800;

export type SettingsJump = { id: string; label: string };

export function SettingsJumpNav({ jumps }: { jumps: SettingsJump[] }) {
  const [active, setActive] = useState(jumps[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);
  const lockedUntil = useRef(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < lockedUntil.current) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = jumps[0]?.id ?? "";
      if (atBottom) {
        // Bagian terakhir mungkin tidak pernah mencapai garis atas; di dasar halaman dialah yang aktif.
        current = jumps[jumps.length - 1]?.id ?? current;
      } else {
        for (const jump of jumps) {
          const section = document.getElementById(jump.id);
          if (section && section.getBoundingClientRect().top <= ACTIVE_LINE) current = jump.id;
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [jumps]);

  // Kapsul aktif digeser ke tengah baris (HP: baris pintasan bisa digulir ke samping).
  useEffect(() => {
    const nav = navRef.current;
    const pill = nav?.querySelector<HTMLElement>(`[data-jump="${active}"]`);
    if (!nav || !pill) return;
    nav.scrollTo({ left: pill.offsetLeft - (nav.clientWidth - pill.clientWidth) / 2, behavior: "smooth" });
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="Bagian pengaturan"
      className="sticky top-14 z-10 -mx-4 flex gap-1.5 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur supports-backdrop-filter:bg-background/80"
    >
      {jumps.map((jump) => (
        <a
          key={jump.id}
          href={`#${jump.id}`}
          data-jump={jump.id}
          aria-current={jump.id === active ? "location" : undefined}
          onClick={() => {
            lockedUntil.current = Date.now() + CLICK_LOCK_MS;
            setActive(jump.id);
          }}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
            jump.id === active
              ? "border-brand/40 bg-brand/5 text-brand"
              : "hover:border-brand/40 hover:bg-brand/5 hover:text-brand",
          )}
        >
          {jump.label}
        </a>
      ))}
    </nav>
  );
}
