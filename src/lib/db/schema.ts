// Schema Drizzle = versi TypeScript dari database/schema-draft.sql.
// Dari file ini drizzle-kit membuat file migration (pnpm db:generate),
// dan Drizzle memberi tipe otomatis untuk setiap query.
//
// Tabel advance_requests, settlements, dan settlement_items ditambahkan nanti.
//
// Referensi:
// - https://orm.drizzle.team/docs/sql-schema-declaration
// - https://orm.drizzle.team/docs/indexes-constraints

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// Kolom id di SQL draft bertipe VARCHAR(36) berisi UUID. UUID dibuat di sisi
// aplikasi dengan crypto.randomUUID() yang sudah tersedia di Node.js.
const id = () =>
  varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// Perbaikan dari draft: semua waktu memakai "timestamp with time zone".
// TIMESTAMP biasa tidak menyimpan zona waktu, sehingga jam 09:00 WIB dan
// 09:00 WITA terbaca sama. Dengan timestamptz, PostgreSQL menyimpan waktu
// dalam UTC dan perbandingan seperti due_date selalu benar.
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

const createdAt = () => timestamptz("created_at").notNull().defaultNow();

export const roles = pgTable("roles", {
  id: id(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  fullName: varchar("full_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 100 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }),
  bankName: varchar("bank_name", { length: 50 }),
  // Perbaikan dari draft: diberi NOT NULL agar tidak ada status "null"
  // yang ambigu (aktif atau tidak?).
  isActive: boolean("is_active").notNull().default(true),
  // true = password masih sementara (baru dibuat/di-reset OWNER), user wajib
  // menggantinya sebelum bisa memakai aplikasi.
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  // Disimpan juga di cookie session. Setiap password diganti/di-reset, angka
  // ini dinaikkan sehingga semua session lama (di HP/laptop lain) tidak
  // berlaku lagi. Lihat lib/auth/dal.ts.
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: createdAt(),
  // DEFAULT CURRENT_TIMESTAMP di SQL hanya terisi saat INSERT.
  // $onUpdate membuat Drizzle mengisi ulang kolom ini di setiap UPDATE.
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Tabel penghubung many-to-many: satu user bisa punya lebih dari satu role.
export const userRoles = pgTable(
  "user_roles",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: varchar("role_id", { length: 36 })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

// Jejak audit: siapa melakukan apa, terhadap data apa, kapan, dari mana.
// Baris di tabel ini tidak boleh diubah atau dihapus oleh aplikasi.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    // Pelaku. Null bila pelakunya belum login (misalnya percobaan login gagal).
    // Tanpa onDelete cascade: menghapus user tidak boleh ikut menghapus jejaknya.
    userId: varchar("user_id", { length: 36 }).references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(),
    entityName: varchar("entity_name", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    // Perbaikan dari draft: jsonb, bukan json. jsonb disimpan dalam format
    // biner sehingga bisa di-query dan di-index (misalnya mencari reason tertentu).
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ipAddress: varchar("ip_address", { length: 45 }), // 45 = panjang maksimal IPv6
    createdAt: createdAt(),
  },
  // Index mempercepat pencarian "riwayat perubahan data X" dan "aktivitas user Y".
  (t) => [
    index("audit_logs_entity_idx").on(t.entityName, t.entityId),
    index("audit_logs_user_id_idx").on(t.userId),
  ],
);

// Catatan setiap percobaan login, dipakai untuk rate limiting.
// Dipisah dari audit_logs karena isinya banyak, bisa dari email yang tidak
// terdaftar, dan boleh dibersihkan berkala (misalnya data > 30 hari dihapus).
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    email: varchar("email", { length: 100 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  // Query rate limit selalu berbentuk "email/IP ini, sejak waktu X",
  // jadi index-nya gabungan (kolom pencarian, created_at).
  (t) => [
    index("login_attempts_email_idx").on(t.email, t.createdAt),
    index("login_attempts_ip_idx").on(t.ipAddress, t.createdAt),
  ],
);
