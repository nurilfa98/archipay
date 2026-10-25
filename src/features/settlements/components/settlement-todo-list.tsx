// Kotak "Perlu tindakan Anda" di halaman Pertanggungjawaban. Server
// Component, tampilannya sama dengan kotak serupa di halaman Uang Muka.
//
// - Karyawan: isi / perbaiki nota, kembalikan sisa dana.
// - OWNER/FINANCE: verifikasi nota, catat pengembalian sisa, bayar penggantian.

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { SettlementTodo } from "@/features/settlements/queries";
import { formatRupiah } from "@/lib/format";

const LABELS: Record<SettlementTodo["kind"], string> = {
  fill: "Isi & kirim nota",
  revise: "Perbaiki lalu kirim ulang nota",
  return: "Kembalikan sisa dana",
  verify: "Verifikasi nota",
  "record-return": "Catat pengembalian sisa dana",
  reimburse: "Bayar penggantian kekurangan",
};

export function SettlementTodoList({ todos }: { todos: SettlementTodo[] }) {
  if (todos.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="settlement-todo-title">
      <h2 id="settlement-todo-title" className="text-sm font-medium">
        Perlu tindakan Anda ({todos.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {todos.map((todo) => (
          <li key={todo.settlementId}>
            <Link
              href={`/settlements/${todo.settlementId}`}
              className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 p-3 transition-colors hover:bg-brand/10"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-medium">
                  {LABELS[todo.kind]}
                  <Warning todo={todo} />
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {todo.settlementNumber ?? todo.advanceNumber} · {formatRupiah(todoAmount(todo))} ·{" "}
                  {isVerifierTask(todo) ? todo.recipientName : todo.purpose}
                </p>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Warning({ todo }: { todo: SettlementTodo }) {
  const text =
    (todo.kind === "fill" || todo.kind === "revise") && todo.settlementDueAtPassed
      ? "lewat batas unggah nota"
      : (todo.kind === "return" || todo.kind === "record-return") && todo.returnOverdue
        ? "lewat batas pengembalian"
        : null;
  if (!text) return null;
  return <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-300">{text}</span>;
}

// Untuk pengembalian/penggantian yang ditampilkan adalah sisa saldo, bukan dana awal.
function todoAmount(todo: SettlementTodo) {
  return todo.kind === "return" || todo.kind === "record-return" || todo.kind === "reimburse"
    ? Math.abs(todo.balance)
    : todo.amount;
}

function isVerifierTask(todo: SettlementTodo) {
  return todo.kind === "verify" || todo.kind === "record-return" || todo.kind === "reimburse";
}
