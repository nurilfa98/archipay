// Badge status company di kartu & detail company (warna & ikon dari status.ts).

import { ToneBadge } from "@/components/tone-badge";
import { COMPANY_STATUS, type CompanyStatus } from "../status";

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  const { label, tone, icon: Icon } = COMPANY_STATUS[status];
  return (
    <ToneBadge tone={tone} className={status === "INACTIVE" ? "text-slate-900 dark:text-slate-100" : undefined}>
      <Icon />
      {label}
    </ToneBadge>
  );
}
