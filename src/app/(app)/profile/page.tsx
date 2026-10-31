// Halaman /profile: pengguna melengkapi datanya sendiri (nomor WhatsApp, rekening
// bank, dan kontak). Dibuka dari menu user di header. Tidak ada di kotak menu, dan
// tidak butuh permission khusus, karena hanya menyentuh akun yang sedang login.
//
// Owner cukup mengundang pengguna (nama & email); sisa datanya diisi sendiri.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileForm } from "@/features/users/components/profile-form";
import { getOwnProfile } from "@/features/users/queries";
import { verifyAccount } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Profil",
};

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profil" description="Lengkapi data Anda agar pengajuan dan notifikasi berjalan lancar." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ProfileContent />
      </Suspense>
    </>
  );
}

async function ProfileContent() {
  const actor = await verifyAccount();
  const user = await getOwnProfile(actor.id);
  if (!user) redirect("/login");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data pengguna</CardTitle>
        <CardDescription>Nama, kontak, dan rekening bank Anda.</CardDescription>
      </CardHeader>
      <CardContent className="max-w-xl">
        <ProfileForm user={user} />
      </CardContent>
    </Card>
  );
}
