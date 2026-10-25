// Filter halaman Audit Log dari URL: /audit?year=2026&month=10&category=ADVANCE&actor=<id>.
// Nilai tidak valid diabaikan (dianggap "semua").

import { z } from "zod";
import { AUDIT_CATEGORIES, type AuditCategory } from "./constants";

export type AuditFilters = {
  year?: number;
  month?: number;
  category?: AuditCategory;
  actorId?: string;
};

const filterYear = z.coerce.number().int().min(2000).max(2100);
const filterMonth = z.coerce.number().int().min(1).max(12);
const filterCategory = z.enum(AUDIT_CATEGORIES);
const filterActor = z.uuid();

export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const year = filterYear.safeParse(first(params.year)).data;
  const month = year ? filterMonth.safeParse(first(params.month)).data : undefined;
  const category = filterCategory.safeParse(first(params.category)).data;
  const actorId = filterActor.safeParse(first(params.actor)).data;
  return { year, month, category, actorId };
}
