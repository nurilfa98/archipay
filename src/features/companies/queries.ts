// Query menu Company (platform, khusus Superadmin / company:manage).
//
// Pemanggil WAJIB sudah memeriksa company:manage (requirePlatformAdmin):
// fungsi di sini membaca SEMUA company, tanpa batas tenant.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md

import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { io } from "next/cache";
import { hasPaidSubscription } from "@/features/subscriptions/queries";
import { db } from "@/lib/db";
import { companies, projects, roles, userRoles, users } from "@/lib/db/schema";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getCompanyAccess, type CompanyAccess } from "@/lib/subscription-access";

export type CompanyOwner = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
};

export type CompanyListItem = {
  id: string;
  name: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: Date;
  userCount: number; // pengguna aktif
  projectCount: number;
  userLimit: number; // batas pengguna aktif paket
  owners: CompanyOwner[];
  // Masa gratis/langganan (lib/subscription-access.ts).
  access: CompanyAccess;
};

export type CompanyDetail = CompanyListItem & {
  address: string | null;
  inactiveUserCount: number;
};

const userCount = sql`(select count(*) from ${users} where ${users.companyId} = ${companies.id} and ${users.isActive})`.mapWith(
  Number,
);
const inactiveUserCount = sql`(select count(*) from ${users} where ${users.companyId} = ${companies.id} and not ${users.isActive})`.mapWith(
  Number,
);
const projectCount = sql`(select count(*) from ${projects} where ${projects.companyId} = ${companies.id})`.mapWith(
  Number,
);

const listColumns = {
  id: companies.id,
  name: companies.name,
  phoneNumber: companies.phoneNumber,
  isActive: companies.isActive,
  createdAt: companies.createdAt,
  userCount,
  projectCount,
  userLimit: companies.userLimit,
  subscriptionUntil: companies.subscriptionUntil,
  hasPaid: hasPaidSubscription(),
};

// Urut nama; halaman Company mengurutkan ulang menurut status (yang perlu
// tindakan dulu, lihat features/companies/status.ts).
export async function listCompanies(): Promise<CompanyListItem[]> {
  await io();
  const [rows, { graceDays }] = await Promise.all([
    db.select(listColumns).from(companies).orderBy(asc(companies.name)),
    getPlatformSettings(),
  ]);
  const owners = await listOwnersByCompany(rows.map((row) => row.id));
  return rows.map(({ subscriptionUntil, hasPaid, ...row }) => ({
    ...row,
    owners: owners.get(row.id) ?? [],
    access: getCompanyAccess({ subscriptionUntil, hasPaid, graceDays }),
  }));
}

export async function getCompany(id: string): Promise<CompanyDetail | null> {
  await io();
  const [[row], { graceDays }] = await Promise.all([
    db
      .select({ ...listColumns, address: companies.address, inactiveUserCount })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1),
    getPlatformSettings(),
  ]);
  if (!row) return null;
  const owners = await listOwnersByCompany([row.id]);
  const { subscriptionUntil, hasPaid, ...company } = row;
  return {
    ...company,
    owners: owners.get(row.id) ?? [],
    access: getCompanyAccess({ subscriptionUntil, hasPaid, graceDays }),
  };
}

// Akun Owner semua company di daftar, dalam satu query (bukan satu per company).
async function listOwnersByCompany(companyIds: string[]) {
  const result = new Map<string, CompanyOwner[]>();
  if (companyIds.length === 0) return result;

  const rows = await db
    .select({
      companyId: users.companyId,
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(inArray(users.companyId, companyIds), eq(roles.name, "OWNER")))
    .orderBy(asc(users.fullName));

  for (const { companyId, ...owner } of rows) {
    if (!companyId) continue;
    result.set(companyId, [...(result.get(companyId) ?? []), owner]);
  }
  return result;
}
