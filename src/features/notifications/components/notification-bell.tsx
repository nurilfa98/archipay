// Lonceng pemberitahuan di navbar: angka = jumlah kartu di /notifications
// (merah bila ada yang mendesak). Klik membuka halaman /notifications.
//
// - NotificationBell      : Server Component, menghitung angka awal.
// - NotificationBellLive  : memperbarui angka di browser setiap pindah halaman,
//                           saat jendela kembali aktif, dan tiap 90 detik (layout
//                           tidak dirender ulang saat pindah halaman).
// - BellButton            : tampilan saja (bell-button.tsx).

import { verifyAccount } from "@/lib/auth/dal";
import { getNotifications, hasUrgent } from "../queries";
import { BellButton } from "./bell-button";
import { NotificationBellLive } from "./notification-bell-live";

export async function NotificationBell() {
  const user = await verifyAccount();
  const cards = await getNotifications(user);
  return <NotificationBellLive initial={{ count: cards.length, urgent: hasUrgent(cards) }} />;
}

// Tampilan sementara selagi angka dihitung.
export function NotificationBellSkeleton() {
  return <BellButton count={0} urgent={false} />;
}
