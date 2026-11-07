// Server Action memuat sisa "Riwayat absen bulan ini" saat daftar di-scroll
// (components/my-records-feed.tsx). Hanya riwayat milik sendiri.
//
// Mengembalikan JSX yang sudah dirender di server: RecordList memakai fungsi
// server (status hari, format jam), jadi tidak perlu dikirim sebagai data mentah.

"use server";

import type { ReactNode } from "react";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { RecordList } from "./components/record-list";
import { listMyRecordsPage, MY_RECORDS_PAGE_SIZE } from "./queries";

export type MoreRecords = { items: ReactNode; nextOffset: number; hasMore: boolean };

export async function loadMoreMyRecords(period: string, offset: number): Promise<MoreRecords | null> {
  const actor = await verifySession();
  if (!can(actor, "attendance:check-in") || !actor.company.attendance) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !Number.isInteger(offset) || offset < 0 || offset > 1000) return null;

  const { rows, hasMore } = await listMyRecordsPage(actor.company.id, actor.id, period, offset);
  return {
    items: <RecordList records={rows} now={new Date()} emptyText="" />,
    nextOffset: offset + MY_RECORDS_PAGE_SIZE,
    hasMore,
  };
}
