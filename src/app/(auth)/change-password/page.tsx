// Halaman /change-password. Ada di grup (auth) agar tampil tanpa sidebar:
// user dengan password sementara belum boleh membuka menu apa pun.
//
// Halaman ini memakai getCurrentUser(), BUKAN verifySession(), karena
// verifySession() justru mengarahkan user berpassword sementara ke sini
// (bisa redirect loop).
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Ganti Password",
};

export default function ChangePasswordPage() {
  return (
    <Card>
      <Suspense fallback={<ChangePasswordSkeleton />}>
        <ChangePasswordContent />
      </Suspense>
    </Card>
  );
}

async function ChangePasswordContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const forced = user.mustChangePassword;

  return (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{forced ? "Buat password baru" : "Ganti password"}</CardTitle>
        <CardDescription>
          {forced
            ? "Anda masih memakai password sementara dari email. Buat password baru untuk melanjutkan."
            : "Setelah diganti, akun Anda otomatis keluar dari perangkat lain."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm email={user.email} />
      </CardContent>
      <CardFooter className="justify-center">
        {forced ? (
          <LogoutButton />
        ) : (
          // nativeButton={false}: Button dirender sebagai <a>, bukan <button>
          <Button variant="link" size="sm" nativeButton={false} render={<Link href="/" />}>
            Kembali ke beranda
          </Button>
        )}
      </CardFooter>
    </>
  );
}

function ChangePasswordSkeleton() {
  return (
    <CardContent className="flex flex-col gap-4">
      <Skeleton className="mx-auto h-6 w-40" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </CardContent>
  );
}
