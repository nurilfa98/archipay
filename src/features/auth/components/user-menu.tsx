// Menu user di pojok kanan navbar: avatar → dropdown berisi nama, email,
// role, link Profil, link Ganti password, dan tombol Keluar.
//
// Avatar memakai inisial nama; begitu foto acuan wajah user DISETUJUI, avatar
// berganti menjadi foto itu (approvedFaceId). Bila foto gagal dimuat, inisial
// tetap tampil.
//
// Letaknya di features/auth (bukan components/layout) karena berisi logika
// auth (logout). Layout cukup "memasang" komponen ini ke slot navbar.
//
// Props `user` adalah DTO kecil dari server (lib/auth/dal.ts), jadi tidak ada
// data sensitif yang ikut terkirim ke browser.
//
// Referensi:
// - https://ui.shadcn.com/docs/components/dropdown-menu
// - node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
//   (memanggil Server Action dari event handler)

"use client";

import { KeyRoundIcon, LogOutIcon, SmartphoneIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { InstallAppDialog } from "@/features/pwa/components/install-app-dialog";
import { useInstallApp } from "@/features/pwa/hooks/use-install-app";
import type { CurrentUser } from "@/lib/auth/dal";

// "Budi Santoso" → "BS"
function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function UserMenu({
  user,
}: {
  user: Pick<CurrentUser, "fullName" | "email" | "roles" | "approvedFaceId">;
}) {
  const { isPending, logout } = useLogout();
  // "Pasang aplikasi": hanya tampil di HP yang belum memasang ArchiPay
  // (lihat features/pwa/hooks/use-install-app.ts).
  const install = useInstallApp();
  const [installGuideOpen, setInstallGuideOpen] = useState(false);

  return (
    <DropdownMenu>
      {/* render={<Button />}: trigger dirender sebagai Button shadcn */}
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 gap-2 px-1.5" />}>
        <Avatar size="sm">
          {user.approvedFaceId && (
            <AvatarImage
              src={`/api/attendance/faces/${user.approvedFaceId}/photo`}
              alt={`Foto ${user.fullName}`}
              className="object-[50%_30%]"
            />
          )}
          <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
        </Avatar>
        {/* Nama hanya tampil di layar ≥ 640px; di HP cukup avatar */}
        <span className="hidden max-w-40 truncate text-sm sm:inline">{user.fullName}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{user.fullName}</span>
            <span className="truncate">{user.email}</span>
            <span className="truncate">{user.roles.join(", ")}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* render={<Link />}: item menu dirender sebagai link Next.js */}
        <DropdownMenuItem render={<Link href="/profile" />}>
          <UserRoundIcon />
          Profil
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/change-password" />}>
          <KeyRoundIcon />
          Ganti password
        </DropdownMenuItem>
        {install.mode !== "hidden" && (
          <DropdownMenuItem
            onClick={() => (install.mode === "native" ? install.promptInstall() : setInstallGuideOpen(true))}
          >
            <SmartphoneIcon />
            Pasang aplikasi
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {/* Server Action dipanggil dari event handler; detail alur logout
            ada di hooks/use-logout.ts */}
        <DropdownMenuItem variant="destructive" disabled={isPending} onClick={logout}>
          <LogOutIcon />
          {isPending ? "Keluar..." : "Keluar"}
        </DropdownMenuItem>
      </DropdownMenuContent>

      {/* Dialog petunjuk pasang (iPhone & browser tanpa dialog bawaan). Sengaja
          di luar DropdownMenuContent: isi dropdown hilang begitu item diklik. */}
      {(install.mode === "ios" || install.mode === "manual") && (
        <InstallAppDialog platform={install.mode} open={installGuideOpen} onOpenChange={setInstallGuideOpen} />
      )}
    </DropdownMenu>
  );
}

export function UserMenuSkeleton() {
  return <Skeleton className="size-8 rounded-full" />;
}
