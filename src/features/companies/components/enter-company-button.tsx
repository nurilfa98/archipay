// Tombol "Buka" untuk Superadmin: masuk ke sebuah company (cookie company
// aktif) lalu kembali ke kotak menu, yang kini berisi menu company tersebut.
//
// Server Component: <form action> ke Server Action, tanpa JavaScript tambahan.

import { ArrowRightIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { enterCompany } from "@/features/companies/actions";

export function EnterCompanyButton({
  companyId,
  active,
  size,
}: {
  companyId: string;
  // true = company ini sedang dibuka.
  active?: boolean;
  size?: ComponentProps<typeof Button>["size"];
}) {
  return (
    <form action={enterCompany}>
      <input type="hidden" name="companyId" value={companyId} />
      <Button type="submit" variant={active ? "secondary" : "outline"} size={size}>
        {active ? "Dibuka" : "Buka"}
        <ArrowRightIcon />
      </Button>
    </form>
  );
}
