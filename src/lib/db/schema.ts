// Schema Drizzle = sumber kebenaran struktur database. Dari file ini
// drizzle-kit membuat file migration di database/migrations (pnpm db:generate),
// dan Drizzle memberi tipe otomatis untuk setiap query.
//
// Referensi:
// - https://orm.drizzle.team/docs/sql-schema-declaration
// - https://orm.drizzle.team/docs/indexes-constraints

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
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

// ---------------------------------------------------------------------------
// Company / tenant
// ---------------------------------------------------------------------------

// ArchiPay multi-tenant: satu deployment melayani banyak company (klien).
// Setiap tabel bisnis punya company_id, dan setiap query dibatasi ke company
// milik user yang login (lihat lib/auth/dal.ts). Company dibuat SUPERADMIN
// beserta Owner pertamanya (features/companies).
export const companies = pgTable("companies", {
  id: id(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  address: varchar("address", { length: 255 }),
  // Nomor telepon / WhatsApp kantor, untuk dihubungi Superadmin.
  phoneNumber: varchar("phone_number", { length: 20 }),
  // Saklar manual Superadmin (klien berhenti / bermasalah). Nonaktif = semua
  // user company ini tidak bisa login. Datanya tetap utuh. Terpisah dari
  // langganan: nonaktif berlaku apa pun status langganannya.
  isActive: boolean("is_active").notNull().default(true),
  // Akhir masa gratis / langganan (BUSINESS-FLOW §17). Diisi saat company
  // dibuat (sekarang + masa gratis) dan setiap tagihan lunas. Lewat tanggal
  // ini + masa tenggang → company terkunci (lib/auth/dal.ts). Tidak perlu job
  // harian: status dihitung dari tanggal ini setiap request.
  subscriptionUntil: timestamptz("subscription_until").notNull().defaultNow(),
  // Batas pengguna AKTIF (Owner, Finance, Karyawan). Diisi saat company dibuat
  // (= batas masa gratis) dan setiap tagihan lunas (= jumlah pengguna yang
  // dibeli, atau ditambah kuota prorata). Menambah/mengaktifkan pengguna
  // melebihi batas ditolak (features/subscriptions/seats.ts).
  userLimit: integer("user_limit").notNull().default(10),
  // Pengingat masa aktif terakhir yang sudah dikirim, "<tanggal berakhir>:<H->"
  // (features/subscriptions/reminders.ts), agar cron tidak mengirim dobel.
  lastReminderKey: varchar("last_reminder_key", { length: 20 }),
  createdAt: createdAt(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Kolom company_id untuk tabel bisnis. Tanpa onDelete cascade: company tidak
// pernah dihapus, hanya dinonaktifkan.
const companyRef = () =>
  varchar("company_id", { length: 36 })
    .notNull()
    .references(() => companies.id);

export const roles = pgTable("roles", {
  id: id(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description"),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    // Company tempat user bekerja. Null HANYA untuk SUPERADMIN (pengelola
    // platform, bukan bagian dari company mana pun).
    companyId: varchar("company_id", { length: 36 }).references(() => companies.id),
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
  },
  (t) => [index("users_company_id_idx").on(t.companyId)],
);

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
    // Company tempat kejadian; halaman Audit Log hanya menampilkan milik
    // company sendiri. Null hanya untuk kejadian di luar company.
    companyId: varchar("company_id", { length: 36 }).references(() => companies.id),
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
  // Index mempercepat pencarian "riwayat perubahan data X", "aktivitas user Y",
  // dan halaman Audit Log yang mengurutkan & menyaring per tanggal.
  (t) => [
    index("audit_logs_entity_idx").on(t.entityName, t.entityId),
    index("audit_logs_user_id_idx").on(t.userId),
    index("audit_logs_company_created_at_idx").on(t.companyId, t.createdAt),
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

// Uang disimpan sebagai bigint dalam RUPIAH (bukan float, bukan sen).
// Rupiah tidak memakai pecahan sen di transaksi sehari-hari, dan bigint
// tidak punya masalah pembulatan seperti float (0.1 + 0.2 !== 0.3).
// mode "number" aman sampai ±9 kuadriliun (Number.MAX_SAFE_INTEGER).
const rupiah = (name: string) => bigint(name, { mode: "number" });

const userRef = (name: string) => varchar(name, { length: 36 }).references(() => users.id);

// Pengaturan per company: TEPAT SATU baris per company (company_id = primary
// key). Baris dibuat bersama company-nya (features/companies/actions.ts),
// nilainya diubah OWNER lewat halaman Pengaturan.
export const companySettings = pgTable(
  "company_settings",
  {
    companyId: varchar("company_id", { length: 36 })
      .primaryKey()
      .references(() => companies.id),
    // Batas unggah nota, dalam hari kalender sejak dana dicairkan.
    settlementDueDays: integer("settlement_due_days").notNull().default(3),
    // Batas mengembalikan sisa dana, dalam hari kalender sejak
    // pertanggungjawaban diverifikasi.
    returnDueDays: integer("return_due_days").notNull().default(3),
    // Nominal maksimal per item pengeluaran tanpa nota (parkir, ojek, dll).
    noReceiptMaxAmount: rupiah("no_receipt_max_amount").notNull().default(50_000),
    // Jumlah uang muka yang sudah lewat batas unggah nota tetapi belum
    // dipertanggungjawabkan. Mencapai angka ini, karyawan tidak bisa menerima uang muka baru.
    maxOverdueAdvances: integer("max_overdue_advances").notNull().default(2),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    updatedById: userRef("updated_by_id"),
  },
  (t) => [
    check("company_settings_settlement_due_days", sql`${t.settlementDueDays} between 1 and 60`),
    check("company_settings_return_due_days", sql`${t.returnDueDays} between 1 and 60`),
    check("company_settings_no_receipt_max", sql`${t.noReceiptMaxAmount} >= 0`),
    check("company_settings_max_overdue", sql`${t.maxOverdueAdvances} between 1 and 10`),
  ],
);

// Project: wadah untuk mengelompokkan uang muka (dan pertanggungjawabannya).
// Dibuat dan dikelola OWNER. Project tidak dihapus, hanya ditandai Selesai,
// agar uang muka lama tetap punya induk. Warna kartu dibuat otomatis dari id
// (features/projects/color.ts), jadi tidak disimpan.
export const projects = pgTable(
  "projects",
  {
    id: id(),
    companyId: companyRef(),
    // Unik per company (lihat index di bawah).
    name: varchar("name", { length: 120 }).notNull(),
    client: varchar("client", { length: 120 }),
    // Kunci ikon (features/projects/constants.ts → PROJECT_ICONS).
    icon: varchar("icon", { length: 30 }).notNull().default("building"),
    // Nilai kontrak ("nominal gelondongan"), hanya terlihat OWNER. Kosong
    // bila belum diisi.
    contractValue: rupiah("contract_value"),
    // ACTIVE / COMPLETED. Project COMPLETED tidak bisa dipilih untuk uang muka baru.
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    createdById: userRef("created_by_id").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("projects_company_name_unique").on(t.companyId, t.name),
    check("projects_status", sql`${t.status} in ('ACTIVE', 'COMPLETED')`),
    check("projects_contract_value_positive", sql`${t.contractValue} is null or ${t.contractValue} > 0`),
  ],
);

// Uang muka. Satu baris = satu kali pemberian dana ke satu karyawan.
// Alur status ada di features/advances/constants.ts.
//
// Kolom "siapa & kapan" disimpan per langkah (dibuat, disetujui, dicairkan,
// dikonfirmasi, dibatalkan) agar halaman detail bisa menampilkannya tanpa
// membaca audit log. Audit log tetap mencatat semuanya sebagai jejak lengkap.
export const advanceRequests = pgTable(
  "advance_requests",
  {
    id: id(),
    companyId: companyRef(),
    // Nomor transaksi "UM-2026-10-0001": tahun-bulan dibuat (zona waktu
    // perusahaan) + urutan yang mulai dari 0001 lagi setiap bulan. Urutan
    // diambil dari document_sequences di dalam transaksi yang sama. Unik per
    // company: setiap company punya urutan nomornya sendiri.
    number: varchar("number", { length: 20 }).notNull(),
    // Periode nomor di atas, untuk filter per tahun / bulan.
    periodYear: smallint("period_year").notNull(),
    periodMonth: smallint("period_month").notNull(),
    recipientId: userRef("recipient_id").notNull(),
    // Project induk. Wajib untuk uang muka baru (dicek Server Action); kosong
    // hanya untuk uang muka lama sebelum fitur project ada ("Tanpa project").
    projectId: varchar("project_id", { length: 36 }).references(() => projects.id),
    amount: rupiah("amount").notNull(),
    purpose: varchar("purpose", { length: 500 }).notNull(),
    disbursementMethod: varchar("disbursement_method", { length: 20 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),

    // Dicatat oleh: OWNER (langsung cair) atau FINANCE (usulan, butuh persetujuan).
    createdById: userRef("created_by_id").notNull(),

    // Persetujuan / penolakan usulan FINANCE oleh OWNER.
    decidedById: userRef("decided_by_id"),
    decidedAt: timestamptz("decided_at"),
    rejectionReason: varchar("rejection_reason", { length: 500 }),

    // Pencairan. disbursedAt selalu waktu server saat dicatat (tidak bisa
    // dimundurkan) dan menjadi titik awal batas unggah nota.
    disbursedById: userRef("disbursed_by_id"),
    disbursedAt: timestamptz("disbursed_at"),
    transferReference: varchar("transfer_reference", { length: 100 }),
    // Salinan rekening tujuan saat transfer. Bila karyawan mengganti
    // rekeningnya nanti, catatan ke mana uang dikirim tetap benar.
    destinationBankName: varchar("destination_bank_name", { length: 50 }),
    destinationAccountNumber: varchar("destination_account_number", { length: 50 }),

    // Tenggat dihitung SEKALI saat pencairan dari company_settings, lalu
    // disimpan. Bila OWNER mengubah pengaturan, uang muka lama tetap memakai
    // aturan yang berlaku (dan disetujui karyawan) saat itu.
    settlementDueAt: timestamptz("settlement_due_at"),
    returnDueDays: integer("return_due_days"),

    // Konfirmasi terima + persetujuan potong gaji oleh karyawan.
    // Teks persis yang disetujui disimpan, bukan hanya centang "setuju",
    // sebagai bukti bila terjadi sengketa.
    acknowledgedAt: timestamptz("acknowledged_at"),
    acknowledgmentText: text("acknowledgment_text"),
    acknowledgmentIp: varchar("acknowledgment_ip", { length: 45 }),
    acknowledgmentUserAgent: varchar("acknowledgment_user_agent", { length: 500 }),

    // Laporan karyawan bahwa dana tidak sesuai (belum terima / nominal beda).
    disputedAt: timestamptz("disputed_at"),
    disputeReason: varchar("dispute_reason", { length: 500 }),

    cancelledById: userRef("cancelled_by_id"),
    cancelledAt: timestamptz("cancelled_at"),
    cancellationReason: varchar("cancellation_reason", { length: 500 }),

    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("advance_requests_amount_positive", sql`${t.amount} > 0`),
    uniqueIndex("advance_requests_company_number_unique").on(t.companyId, t.number),
    // "Uang muka milik saya" dan "yang perlu tindakan" selalu disaring per
    // penerima/status lalu diurutkan dari yang terbaru.
    index("advance_requests_recipient_idx").on(t.recipientId, t.createdAt),
    index("advance_requests_status_idx").on(t.companyId, t.status, t.createdAt),
    index("advance_requests_period_idx").on(t.companyId, t.periodYear, t.periodMonth),
    index("advance_requests_project_idx").on(t.projectId, t.createdAt),
  ],
);

// Penghitung nomor transaksi per company per jenis dokumen per bulan, misalnya
// (company A, "UM", 2026, 10) → 12 berarti nomor terakhir bulan itu UM-2026-10-0012.
// Dipakai lib/document-number.ts; nanti juga untuk pertanggungjawaban.
//
// Kenapa tabel penghitung, bukan MAX(nomor) + 1? Dua transaksi yang disimpan
// bersamaan bisa membaca MAX yang sama lalu mendapat nomor kembar. Dengan
// INSERT ... ON CONFLICT DO UPDATE, baris penghitung terkunci sampai
// transaksi selesai, jadi nomor selalu berurutan dan tanpa lompatan
// (kalau transaksi gagal, kenaikan penghitung ikut dibatalkan).
export const documentSequences = pgTable(
  "document_sequences",
  {
    companyId: companyRef(),
    prefix: varchar("prefix", { length: 10 }).notNull(),
    periodYear: smallint("period_year").notNull(),
    periodMonth: smallint("period_month").notNull(),
    lastValue: integer("last_value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.prefix, t.periodYear, t.periodMonth] })],
);

// Kategori biaya per nota (Transportasi, Konsumsi, ...), milik masing-masing
// company. Kategori awal dibuat bersama company-nya
// (features/companies/constants.ts), lalu dikelola OWNER di Pengaturan.
// Kategori tidak dihapus, hanya dinonaktifkan, agar nota lama tetap utuh.
export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    companyId: companyRef(),
    name: varchar("name", { length: 50 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("expense_categories_company_name_unique").on(t.companyId, t.name)],
);

// Pertanggungjawaban: laporan penggunaan SATU uang muka (1 : 1).
// Status prosesnya tidak disimpan di sini, melainkan di advance_requests.status
// (ACKNOWLEDGED = draf, SUBMITTED, REVISION_REQUESTED, ...), agar satu uang
// muka hanya punya satu status. Lihat features/settlements/constants.ts.
export const settlements = pgTable(
  "settlements",
  {
    id: id(),
    companyId: companyRef(),
    advanceId: varchar("advance_id", { length: 36 })
      .notNull()
      .unique()
      .references(() => advanceRequests.id),
    // "PJ-2026-10-0001", diberikan saat PERTAMA KALI dikirim (draf belum
    // bernomor), dan tidak berubah walau laporan dikembalikan untuk diperbaiki.
    // Unik per company.
    number: varchar("number", { length: 20 }),
    periodYear: smallint("period_year"),
    periodMonth: smallint("period_month"),
    // Waktu pengiriman terakhir (setelah perbaikan, waktu ini diperbarui).
    submittedAt: timestamptz("submitted_at"),

    // Catatan "kembalikan untuk diperbaiki" yang sedang berlaku. Riwayat
    // lengkapnya ada di audit log.
    revisionNote: varchar("revision_note", { length: 500 }),
    // Alasan pengiriman yang melewati batas unggah nota. Null bila tepat waktu.
    lateReason: varchar("late_reason", { length: 500 }),
    revisionRequestedById: userRef("revision_requested_by_id"),
    revisionRequestedAt: timestamptz("revision_requested_at"),

    // Hasil verifikasi. Nominalnya SNAPSHOT saat diverifikasi; sumber
    // kebenaran saldo tetap advance_ledger_entries.
    verifiedById: userRef("verified_by_id"),
    verifiedAt: timestamptz("verified_at"),
    approvedAmount: rupiah("approved_amount"),
    balanceAmount: rupiah("balance_amount"),
    // Batas mengembalikan sisa dana (bila saldo > 0), dihitung dari
    // advance_requests.return_due_days yang disetujui karyawan.
    returnDueAt: timestamptz("return_due_at"),

    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("settlements_company_number_unique").on(t.companyId, t.number),
    index("settlements_period_idx").on(t.companyId, t.periodYear, t.periodMonth),
  ],
);

// Satu baris = satu nota (atau satu biaya tanpa nota).
export const settlementItems = pgTable(
  "settlement_items",
  {
    id: id(),
    companyId: companyRef(),
    settlementId: varchar("settlement_id", { length: 36 })
      .notNull()
      .references(() => settlements.id),
    // Tanggal yang tertulis di nota (tanpa jam), "2026-10-24".
    receiptDate: date("receipt_date", { mode: "string" }).notNull(),
    categoryId: varchar("category_id", { length: 36 })
      .notNull()
      .references(() => expenseCategories.id),
    description: varchar("description", { length: 200 }).notNull(),
    amount: rupiah("amount").notNull(),

    // Biaya tanpa nota (parkir, ojek): wajib alasan, nominal dibatasi
    // company_settings.no_receipt_max_amount.
    hasReceipt: boolean("has_receipt").notNull(),
    noReceiptReason: varchar("no_receipt_reason", { length: 200 }),

    // File foto/PDF nota di penyimpanan privat (lib/storage.ts).
    fileKey: varchar("file_key", { length: 300 }),
    // SHA-256 isi file, untuk menolak nota yang sama dipakai dua kali.
    fileHash: varchar("file_hash", { length: 64 }),
    fileContentType: varchar("file_content_type", { length: 50 }),
    fileSize: integer("file_size"),

    // PENDING sampai diverifikasi, lalu APPROVED / REJECTED.
    verificationStatus: varchar("verification_status", { length: 20 }).notNull().default("PENDING"),
    rejectionReason: varchar("rejection_reason", { length: 500 }),

    createdAt: createdAt(),
  },
  (t) => [
    check("settlement_items_amount_positive", sql`${t.amount} > 0`),
    check("settlement_items_receipt_file", sql`${t.hasReceipt} = (${t.fileKey} is not null)`),
    index("settlement_items_settlement_idx").on(t.settlementId),
    // Satu file nota hanya boleh dipakai sekali di satu company.
    uniqueIndex("settlement_items_file_hash_unique")
      .on(t.companyId, t.fileHash)
      .where(sql`${t.fileHash} is not null`),
  ],
);

// Buku saldo uang muka (ledger). Setiap perpindahan uang = satu baris BARU
// yang tidak pernah diubah atau dihapus. Saldo = SUM(amount):
//   > 0 karyawan masih memegang uang kantor, < 0 kantor berutang ke karyawan.
//
//   DISBURSEMENT      +500.000  saat karyawan mengonfirmasi terima dana
//   EXPENSE_APPROVED  −320.000  per nota yang disetujui saat verifikasi
//   RETURN            −100.000  sisa dana dikembalikan karyawan (boleh dicicil)
//   PAYROLL_DEDUCTION  −80.000  sisa yang lewat batas dipotong dari gaji
//   REIMBURSEMENT      +50.000  kantor mengganti kekurangan (karyawan nombok)
export const advanceLedgerEntries = pgTable(
  "advance_ledger_entries",
  {
    id: id(),
    companyId: companyRef(),
    advanceId: varchar("advance_id", { length: 36 })
      .notNull()
      .references(() => advanceRequests.id),
    type: varchar("type", { length: 30 }).notNull(),
    amount: rupiah("amount").notNull(),
    settlementItemId: varchar("settlement_item_id", { length: 36 }).references(() => settlementItems.id),
    // Cara uang berpindah (CASH / TRANSFER / PAYROLL) & nomor referensi transfer.
    method: varchar("method", { length: 20 }),
    reference: varchar("reference", { length: 100 }),
    // Periode gaji untuk PAYROLL_DEDUCTION, "2026-11".
    payrollPeriod: varchar("payroll_period", { length: 7 }),
    note: varchar("note", { length: 300 }),
    createdById: userRef("created_by_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("advance_ledger_entries_amount_nonzero", sql`${t.amount} <> 0`),
    index("advance_ledger_entries_advance_idx").on(t.advanceId, t.createdAt),
    index("advance_ledger_entries_payroll_idx").on(t.companyId, t.payrollPeriod),
  ],
);

// Pengingat WhatsApp yang sudah terkirim (features/reminders). Satu jenis
// pengingat hanya dikirim SEKALI per uang muka, walau cron berjalan dua kali
// atau diulang; unique index menjadi penjaganya.
export const reminderLogs = pgTable(
  "reminder_logs",
  {
    id: id(),
    advanceId: varchar("advance_id", { length: 36 })
      .notNull()
      .references(() => advanceRequests.id),
    // SETTLEMENT_DUE_SOON, SETTLEMENT_OVERDUE, RETURN_DUE_SOON, RETURN_OVERDUE
    kind: varchar("kind", { length: 30 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reminder_logs_advance_kind_unique").on(t.advanceId, t.kind)],
);

// ---------------------------------------------------------------------------
// Langganan & pengaturan platform (BUSINESS-FLOW §17)
// ---------------------------------------------------------------------------

// Satu baris saja (id = "default"): kontak admin, gambar QRIS statis, masa
// gratis & tenggang. Diubah Superadmin di Pengaturan platform; bila barisnya
// belum ada, lib/platform-settings.ts memakai nilai bawaan.
export const platformSettings = pgTable(
  "platform_settings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    // Nomor WhatsApp admin ArchiPay (format 62…), tujuan kabar klaim bayar.
    adminPhone: varchar("admin_phone", { length: 20 }),
    // Key gambar QRIS statis di lib/storage.ts; null = belum diunggah.
    qrisImageKey: varchar("qris_image_key", { length: 255 }),
    freeDays: integer("free_days").notNull().default(14),
    graceDays: integer("grace_days").notNull().default(3),
    // Batas pengguna aktif selama masa gratis.
    trialMaxUsers: integer("trial_max_users").notNull().default(10),
    // Harga langganan (features/subscriptions/pricing.ts): harga dasar per
    // bulan sudah termasuk `included_users` pengguna, tiap pengguna di atasnya
    // + `extra_user_price` per bulan. Paket 6 & 12 bulan = harga bulanan ×
    // jumlah bulan − diskon (%). Harga 0 = paket belum dijual.
    basePrice: rupiah("base_price").notNull().default(0),
    includedUsers: integer("included_users").notNull().default(10),
    extraUserPrice: rupiah("extra_user_price").notNull().default(0),
    discount6: integer("discount_6").notNull().default(10),
    discount12: integer("discount_12").notNull().default(20),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("platform_settings_free_days_check", sql`${t.freeDays} BETWEEN 0 AND 90`),
    check("platform_settings_grace_days_check", sql`${t.graceDays} BETWEEN 0 AND 30`),
    check("platform_settings_trial_max_users_check", sql`${t.trialMaxUsers} BETWEEN 1 AND 1000`),
    check("platform_settings_included_users_check", sql`${t.includedUsers} BETWEEN 1 AND 1000`),
    check("platform_settings_prices_check", sql`${t.basePrice} >= 0 AND ${t.extraUserPrice} >= 0`),
    check("platform_settings_discounts_check", sql`${t.discount6} BETWEEN 0 AND 90 AND ${t.discount12} BETWEEN 0 AND 90`),
  ],
);

// Harga khusus per company (hasil negosiasi). Kolom yang NULL memakai nilai
// standar di platform_settings. Diskon 6/12 bulan selalu mengikuti standar.
export const companyPricing = pgTable(
  "company_pricing",
  {
    companyId: varchar("company_id", { length: 36 })
      .primaryKey()
      .references(() => companies.id),
    basePrice: rupiah("base_price"),
    includedUsers: integer("included_users"),
    extraUserPrice: rupiah("extra_user_price"),
    note: varchar("note", { length: 255 }),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("company_pricing_base_price_check", sql`${t.basePrice} IS NULL OR ${t.basePrice} > 0`),
    check("company_pricing_included_users_check", sql`${t.includedUsers} IS NULL OR ${t.includedUsers} BETWEEN 1 AND 1000`),
    check("company_pricing_extra_user_price_check", sql`${t.extraUserPrice} IS NULL OR ${t.extraUserPrice} >= 0`),
  ],
);

// Rekening bank tujuan transfer langganan. Boleh lebih dari satu, boleh
// kosong (Owner hanya melihat QRIS). Nomor disimpan angka saja.
export const paymentBankAccounts = pgTable("payment_bank_accounts", {
  id: id(),
  bankName: varchar("bank_name", { length: 50 }).notNull(),
  accountNumber: varchar("account_number", { length: 30 }).notNull(),
  accountName: varchar("account_name", { length: 100 }).notNull(),
  createdAt: createdAt(),
});

// Tagihan langganan. Dua jenis (`kind`):
// - PLAN : paket 1/6/12 bulan untuk `users` pengguna; lunas → masa aktif
//          diperpanjang & batas pengguna company = `users`.
// - TOPUP: tambah `users` pengguna untuk sisa masa aktif (prorata), tanpa
//          `months`; lunas → batas pengguna company bertambah `users`.
// Harga = SNAPSHOT saat tagihan dibuat. Baris baru tercipta saat Owner menekan "Saya sudah bayar"
// (langsung CLAIMED) atau Superadmin mencatat pembayaran langsung (ACTIVE);
// memilih paket saja tidak menyimpan apa pun.
// Status: CLAIMED (ada pembayaran menunggu verifikasi), UNDERPAID (diterima
// < harga, Owner melengkapi pada tagihan yang sama), ACTIVE (lunas, periode
// terisi), REJECTED (ditolak, status akhir). "Habis" tidak disimpan: dihitung
// dari companies.subscription_until.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    companyId: companyRef(),
    kind: varchar("kind", { length: 10 }).notNull().default("PLAN"),
    months: smallint("months"),
    users: integer("users").notNull(),
    price: rupiah("price").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    // Periode terisi saat lunas: mulai dari akhir langganan yang sedang
    // berjalan (bila masih di masa depan) atau saat lunas.
    startsAt: timestamptz("starts_at"),
    endsAt: timestamptz("ends_at"),
    paidAt: timestamptz("paid_at"),
    // Total yang sudah diterima (Σ subscription_payments ACCEPTED). Lunas bila ≥ price.
    amountPaid: rupiah("amount_paid").notNull().default(0),
    note: varchar("note", { length: 255 }),
    // Penolakan akhir (dana tidak masuk / bukti palsu): tampil ke Owner.
    rejectedAt: timestamptz("rejected_at"),
    rejectionNote: varchar("rejection_note", { length: 255 }),
    createdById: userRef("created_by_id").notNull(),
    confirmedById: userRef("confirmed_by_id"),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("subscriptions_company_created_at_idx").on(t.companyId, t.createdAt),
    index("subscriptions_status_idx").on(t.status),
    // Satu tagihan terbuka per company, dijaga database (dua klik bersamaan).
    uniqueIndex("subscriptions_company_open_unique")
      .on(t.companyId)
      .where(sql`${t.status} IN ('CLAIMED', 'UNDERPAID')`),
    check("subscriptions_status_check", sql`${t.status} IN ('CLAIMED', 'UNDERPAID', 'ACTIVE', 'REJECTED')`),
    check(
      "subscriptions_kind_check",
      sql`(${t.kind} = 'PLAN' AND ${t.months} IN (1, 6, 12)) OR (${t.kind} = 'TOPUP' AND ${t.months} IS NULL)`,
    ),
    check("subscriptions_users_check", sql`${t.users} > 0`),
  ],
);

// Pembayaran per tagihan: satu baris per bukti transfer dari Owner (atau
// pencatatan langsung oleh Superadmin, tanpa bukti). Superadmin mengisi
// nominal yang benar-benar masuk (amount_received). Baris tidak pernah dihapus.
export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: id(),
    subscriptionId: varchar("subscription_id", { length: 36 })
      .notNull()
      .references(() => subscriptions.id),
    companyId: companyRef(),
    // PENDING (menunggu verifikasi), ACCEPTED (nominal diakui), REJECTED.
    status: varchar("status", { length: 20 }).notNull(),
    // Key bukti di lib/storage.ts ("<companyId>/subscription-proofs/...").
    // Null hanya untuk pencatatan langsung oleh Superadmin.
    proofKey: varchar("proof_key", { length: 255 }),
    proofContentType: varchar("proof_content_type", { length: 50 }),
    // Catatan Owner saat mengirim (bank pengirim, jam transfer).
    note: varchar("note", { length: 255 }),
    amountReceived: rupiah("amount_received"),
    // Keterangan Superadmin / alasan tolak.
    reviewNote: varchar("review_note", { length: 255 }),
    reviewedAt: timestamptz("reviewed_at"),
    reviewedById: userRef("reviewed_by_id"),
    createdById: userRef("created_by_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("subscription_payments_subscription_idx").on(t.subscriptionId, t.createdAt),
    index("subscription_payments_status_idx").on(t.status),
    check("subscription_payments_status_check", sql`${t.status} IN ('PENDING', 'ACCEPTED', 'REJECTED')`),
  ],
);
