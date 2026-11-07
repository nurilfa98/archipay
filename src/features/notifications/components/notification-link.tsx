// Kartu kabar di /notifications: diklik = menandai sudah dibuka (hilang dari
// lonceng) sambil pindah ke halaman tujuannya. Plus tombol "Tandai semua dibaca".

"use client";

import { CheckCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead, markNotificationRead } from "../actions";

export function NotificationLink({
  id,
  href,
  className,
  children,
}: {
  id: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => void markNotificationRead(id).catch(() => undefined)}>
      {children}
    </Link>
  );
}

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsRead();
          router.refresh();
        })
      }
    >
      <CheckCheckIcon />
      Tandai semua dibaca
    </Button>
  );
}
