// Halaman /notifications (lonceng di navbar): kartu info untuk Anda,
// dikelompokkan "Perlu tindakan", "Pengingat", dan "Kabar terbaru". Tiap kartu bisa
// diklik dan langsung membuka halaman tujuannya. Tugas & pengingat hilang sendiri
// setelah urusannya selesai; kabar hilang setelah dibuka (BUSINESS-FLOW §23).
//
// Polanya sama dengan halaman lain: judul statis di luar <Suspense>, data
// (yang membaca sesi) di dalamnya.

import {
  BanknoteIcon,
  BellIcon,
  BugIcon,
  CalendarClockIcon,
  CalendarOffIcon,
  ChevronRightIcon,
  CircleCheckBigIcon,
  CreditCardIcon,
  InfoIcon,
  LockIcon,
  PlaneIcon,
  ReceiptTextIcon,
  ScanFaceIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ToneBadge } from "@/components/tone-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconTile, type TileTone } from "@/features/dashboard/components/dashboard-ui";
import {
  getNotifications,
  type NotificationCard,
  type NotificationIcon,
} from "@/features/notifications/queries";
import { MarkAllReadButton, NotificationLink } from "@/features/notifications/components/notification-link";
import { verifyAccount } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Pemberitahuan",
};

const ICONS: Record<NotificationIcon, LucideIcon> = {
  advance: BanknoteIcon,
  settlement: ReceiptTextIcon,
  face: ScanFaceIcon,
  leave: PlaneIcon,
  lock: LockIcon,
  payroll: WalletCardsIcon,
  calendar: CalendarOffIcon,
  subscription: CalendarClockIcon,
  error: BugIcon,
  billing: CreditCardIcon,
  info: InfoIcon,
};

const TONES: Record<NotificationCard["tone"], TileTone> = {
  danger: "rose",
  warning: "amber",
  brand: "brand",
};

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Pemberitahuan" description="Hal yang perlu Anda tangani dan kabar terbaru untuk Anda." />
      <Suspense fallback={<NotificationsSkeleton />}>
        <NotificationsContent />
      </Suspense>
    </>
  );
}

async function NotificationsContent() {
  const user = await verifyAccount();
  const cards = await getNotifications(user);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card p-10 text-center">
        <IconTile icon={CircleCheckBigIcon} tone="emerald" />
        <p className="font-medium">Tidak ada yang perlu Anda lakukan saat ini</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tugas dan pengingat akan muncul di sini, dan angkanya tampil di ikon lonceng di atas.
        </p>
      </div>
    );
  }

  const actions = cards.filter((card) => card.group === "ACTION");
  const reminders = cards.filter((card) => card.group === "REMINDER");
  const infos = cards.filter((card) => card.group === "INFO");

  return (
    <div className="flex flex-col gap-6">
      <Group title="Perlu tindakan" cards={actions} />
      <Group title="Pengingat" cards={reminders} />
      <Group title="Kabar terbaru" cards={infos} hint="Hilang setelah dibuka." action={<MarkAllReadButton />} />
    </div>
  );
}

function Group({
  title,
  cards,
  hint,
  action,
}: {
  title: string;
  cards: NotificationCard[];
  hint?: string;
  action?: ReactNode;
}) {
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <BellIcon className="size-4" />
          {title} ({cards.length})
          {hint && <span className="text-xs font-normal">· {hint}</span>}
        </h2>
        {action}
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {cards.map((card) => {
          const className =
            "flex h-full items-start gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50";
          const content = (
            <>
              <IconTile icon={ICONS[card.icon]} tone={TONES[card.tone]} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{card.title}</p>
                {card.description && <p className="mt-0.5 text-xs text-muted-foreground">{card.description}</p>}
                {card.at && <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(card.at)}</p>}
              </div>
              {card.count !== null && (
                <ToneBadge tone={card.tone === "danger" ? "danger" : card.tone === "warning" ? "warning" : "pending"}>
                  {card.count}
                </ToneBadge>
              )}
              <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </>
          );
          return (
            <li key={card.key}>
              {card.notificationId ? (
                <NotificationLink id={card.notificationId} href={card.href} className={className}>
                  {content}
                </NotificationLink>
              ) : (
                <Link href={card.href} className={className}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" />
    </div>
  );
}
