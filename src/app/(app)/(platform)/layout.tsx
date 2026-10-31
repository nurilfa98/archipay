// Layout halaman platform Superadmin (route group "(platform)", tanpa
// mengubah URL): /companies, /billing, /platform-settings. Menambahkan tab
// di atas halaman untuk berpindah antarhalaman platform.
//
// Setiap page tetap memanggil requirePlatformAdmin() sendiri; layout ini
// hanya tampilan.
//
// Referensi: node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md (Route groups)

import { Suspense } from "react";
import { PlatformNav } from "@/features/subscriptions/components/platform-nav";
import { countClaimedSubscriptions } from "@/features/subscriptions/queries";
import { verifyAccount } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export default function PlatformLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={<div className="h-[41px] border-b" />}>
        <PlatformTabs />
      </Suspense>
      {children}
    </>
  );
}

async function PlatformTabs() {
  const user = await verifyAccount();
  if (!can(user, "company:manage")) return null;
  return <PlatformNav claimed={await countClaimedSubscriptions()} />;
}
