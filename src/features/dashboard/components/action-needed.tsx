// "Perlu tindakan Anda" di Beranda: gabungan tugas uang muka (konfirmasi
// terima, persetujuan, pencatatan pencairan) dan pertanggungjawaban (isi nota,
// verifikasi, pengembalian/penggantian) milik user ini. Karyawan melihat tugas
// miliknya, Finance melihat tugas seluruh perusahaan. Server Component.

import {
  BadgeCheckIcon,
  BanknoteIcon,
  CircleCheckBigIcon,
  FileCheck2Icon,
  HandCoinsIcon,
  ReceiptTextIcon,
  RotateCcwIcon,
  type LucideIcon,
} from "lucide-react";
import { todoLabel } from "@/features/advances/components/advance-todo-list";
import { listAdvances } from "@/features/advances/queries";
import { needsActionFrom } from "@/features/advances/service";
import { SETTLEMENT_TODO_LABELS, todoAmount } from "@/features/settlements/components/settlement-todo-list";
import { listSettlementTodos, type SettlementTodo } from "@/features/settlements/queries";
import type { CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatRupiah } from "@/lib/format";
import { LinkRow, SectionCard, type TileTone } from "./dashboard-ui";

const MAX_SHOWN = 5;

type Item = { key: string; href: string; icon: LucideIcon; tone: TileTone; title: string; detail: string };

const SETTLEMENT_ICONS: Record<SettlementTodo["kind"], { icon: LucideIcon; tone: TileTone }> = {
  fill: { icon: ReceiptTextIcon, tone: "brand" },
  revise: { icon: ReceiptTextIcon, tone: "amber" },
  return: { icon: RotateCcwIcon, tone: "amber" },
  verify: { icon: FileCheck2Icon, tone: "brand" },
  "record-return": { icon: RotateCcwIcon, tone: "indigo" },
  "confirm-claim": { icon: BadgeCheckIcon, tone: "indigo" },
  "ack-reimburse": { icon: HandCoinsIcon, tone: "emerald" },
  reimburse: { icon: BanknoteIcon, tone: "indigo" },
};

export async function ActionNeeded({ user }: { user: CompanyUser }) {
  const viewAll = can(user, "advance:view-all");
  const [open, settlementTodos] = await Promise.all([
    listAdvances({
      companyId: user.company.id,
      recipientId: viewAll ? undefined : user.id,
      statuses: ["PENDING_APPROVAL", "APPROVED", "DISBURSED"],
    }),
    listSettlementTodos({ id: user.id, companyId: user.company.id, canVerify: can(user, "settlement:verify") }),
  ]);

  const items: Item[] = [
    ...open
      .filter((advance) => needsActionFrom(advance, user))
      .map((advance) => ({
        key: `a-${advance.id}`,
        href: `/advances/${advance.id}`,
        icon: BanknoteIcon,
        tone: "brand" as const,
        title: todoLabel(advance, user),
        detail: `${advance.number} · ${formatRupiah(advance.amount)} · ${
          advance.recipientId === user.id ? advance.purpose : advance.recipientName
        }`,
      })),
    ...settlementTodos.map((todo) => {
      const own =
        todo.kind === "fill" || todo.kind === "revise" || todo.kind === "return" || todo.kind === "ack-reimburse";
      return {
        key: `s-${todo.settlementId}`,
        href: `/settlements/${todo.settlementId}`,
        ...SETTLEMENT_ICONS[todo.kind],
        title: SETTLEMENT_TODO_LABELS[todo.kind],
        detail: `${todo.settlementNumber ?? todo.advanceNumber} · ${formatRupiah(todoAmount(todo))} · ${
          own ? todo.purpose : todo.recipientName
        }`,
      };
    }),
  ];

  if (items.length === 0) {
    return (
      <SectionCard title="Perlu tindakan Anda" icon={CircleCheckBigIcon} tone="emerald">
        <p className="text-sm text-muted-foreground">Tidak ada tugas yang perlu Anda kerjakan saat ini.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={`Perlu tindakan Anda (${items.length})`} icon={BadgeCheckIcon} tone="amber">
      <ul className="flex flex-col gap-2">
        {items.slice(0, MAX_SHOWN).map((item) => (
          <li key={item.key}>
            <LinkRow href={item.href} icon={item.icon} tone={item.tone} title={item.title} description={item.detail} />
          </li>
        ))}
      </ul>
      {items.length > MAX_SHOWN && (
        <p className="text-center text-xs text-muted-foreground">
          dan {items.length - MAX_SHOWN} lagi di halaman Uang muka / Pertanggungjawaban proyek
        </p>
      )}
    </SectionCard>
  );
}
