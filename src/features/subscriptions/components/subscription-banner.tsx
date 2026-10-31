// Spanduk masa aktif langganan di bawah header (layout), khusus Owner
// (subscription:view): mulai H-7 sebelum masa gratis/langganan habis
// (kuning), selama masa tenggang dan saat terkunci (merah). Server Component.

import { ArrowRightIcon, CalendarClockIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function SubscriptionBanner({ user }: { user: CurrentUser }) {
  const access = user.company?.access;
  if (!access || !access.needsReminder || !can(user, "subscription:view")) return null;

  const urgent = access.status === "GRACE" || access.status === "LOCKED";
  const message =
    access.status === "LOCKED"
      ? "Masa berlangganan habis dan akses company dikunci. Tim Anda tidak bisa masuk sampai pembayaran diverifikasi."
      : access.status === "GRACE"
        ? `Masa aktif habis ${formatDate(access.until)}. Company dikunci ${formatDate(access.graceUntil)} bila belum diperpanjang.`
        : `${access.status === "TRIAL" ? "Masa gratis" : "Masa langganan"} berakhir ${formatDate(access.until)}${
            access.daysLeft > 0 ? ` (${access.daysLeft} hari lagi)` : ""
          }.`;
  const Icon = access.status === "LOCKED" ? LockIcon : CalendarClockIcon;

  return (
    <div
      className={cn(
        "border-b",
        urgent
          ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">{message}</span>
        <Button size="sm" variant="outline" className="h-7 bg-background" nativeButton={false} render={<Link href="/subscription" />}>
          {urgent ? "Bayar sekarang" : "Perpanjang"}
          <ArrowRightIcon />
        </Button>
      </div>
    </div>
  );
}
