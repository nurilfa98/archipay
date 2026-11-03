// Halaman /verify-phone: isi & verifikasi nomor WhatsApp dengan kode OTP.
// - Wajib (forced): user company tanpa nomor terverifikasi diarahkan ke sini
//   oleh lib/auth/dal.ts sebelum bisa membuka menu apa pun.
// - Ganti nomor: dibuka dari menu Profil (?from=profile).
//
// Ada di grup (auth) agar tampil tanpa menu, dan memakai getCurrentUser()
// (bukan verifySession) agar tidak redirect loop, sama seperti /change-password.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { PhoneVerifyForm } from "@/features/auth/components/phone-verify-form";
import { getOwnProfile } from "@/features/users/queries";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Verifikasi WhatsApp",
};

export default function VerifyPhonePage({ searchParams }: PageProps<"/verify-phone">) {
  return (
    <Card>
      <Suspense fallback={<Skeleton className="m-6 h-48" />}>
        <VerifyPhoneContent searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}

async function VerifyPhoneContent({ searchParams }: Pick<PageProps<"/verify-phone">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  // Superadmin tidak memakai nomor WhatsApp.
  if (!user.company || user.roles.includes("SUPERADMIN")) redirect("/");

  const forced = user.mustVerifyPhone;
  const fromProfile = !forced && (await searchParams).from === "profile";
  const profile = await getOwnProfile(user.id);

  return (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{forced ? "Verifikasi nomor WhatsApp" : "Ganti nomor WhatsApp"}</CardTitle>
        <CardDescription>
          {forced
            ? "Nomor WhatsApp wajib untuk notifikasi uang muka, pengingat, dan absensi. Verifikasi sekali dengan kode yang dikirim ke WhatsApp Anda."
            : "Nomor baru tersimpan setelah kode verifikasi yang dikirim ke nomor tersebut cocok."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PhoneVerifyForm
          defaultPhone={forced ? (profile?.phoneNumber ?? null) : null}
          returnTo={fromProfile ? "profile" : "home"}
        />
      </CardContent>
      <CardFooter className="justify-center">
        {forced ? (
          <LogoutButton />
        ) : (
          <Button variant="link" size="sm" nativeButton={false} render={<Link href={fromProfile ? "/profile" : "/"} />}>
            Batal
          </Button>
        )}
      </CardFooter>
    </>
  );
}
