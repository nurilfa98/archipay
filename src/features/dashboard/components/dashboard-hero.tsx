// Sapaan di atas Beranda: nama, tanggal hari ini, dan role. Server Component.

import { io } from "next/cache";
import { PersonAvatar } from "@/features/attendance/components/person-avatar";
import { RoleBadges } from "@/features/users/components/user-badges";
import type { CompanyUser } from "@/lib/auth/dal";
import { formatDate } from "@/lib/dates";

export async function DashboardHero({ user, subtitle }: { user: CompanyUser; subtitle: string }) {
  // Cache Components: new Date() wajib setelah io(), agar tidak ikut prerender
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md).
  await io();
  const today = formatDate(new Date());
  return (
    <section className="flex items-center gap-4 rounded-2xl border bg-linear-to-br from-brand/10 via-card to-card p-4 sm:p-6">
      <PersonAvatar name={user.fullName} className="bg-brand/15 text-brand ring-brand/30" size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xs text-muted-foreground">{today}</p>
        <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
          Halo, {user.fullName.split(" ")[0]}
        </h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        <RoleBadges roles={[...user.roles]} className="mt-1" />
      </div>
    </section>
  );
}
