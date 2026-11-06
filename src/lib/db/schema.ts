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
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
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

// Kolom company_id untuk tabel bisnis. Tanpa onDelete cascade: company
// biasanya hanya dinonaktifkan. Hapus company (Superadmin) menghapus barisnya
// secara eksplisit, berurutan, di features/companies/actions.ts (deleteCompany).
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
    // Kapan nomor WhatsApp terakhir diverifikasi dengan kode OTP
    // (features/auth/phone-actions.ts). NULL = belum: user company diarahkan
    // ke /verify-phone sebelum bisa memakai aplikasi (lib/auth/dal.ts).
    phoneVerifiedAt: timestamptz("phone_verified_at"),
    // Kuota cuti tahunan khusus karyawan ini (hari). NULL = kuota company.
    annualLeaveQuota: integer("annual_leave_quota"),
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

// Kode OTP verifikasi nomor WhatsApp yang sedang berjalan, satu baris per
// user. Kode disimpan sebagai hash (SHA-256), tidak pernah teks asli.
// Batas: berlaku 10 menit, maks. 5 kali coba per kode, kirim ulang tiap 60
// detik, maks. 3 kode per hari (hemat kuota WhatsApp).
export const phoneVerifications = pgTable("phone_verifications", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Nomor yang sedang diverifikasi (format 62…); disalin ke users saat cocok.
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  // Hitungan kirim per tanggal (zona waktu perusahaan).
  sendDate: date("send_date").notNull(),
  sendCount: integer("send_count").notNull().default(0),
  lastSentAt: timestamptz("last_sent_at").notNull(),
});

// Perangkat yang sedang login: SATU baris per login (BUSINESS-FLOW §2.1).
// `id` disimpan di cookie sesi; cookie hanya berlaku bila barisnya ada dan
// belum dicabut (lib/auth/dal.ts), sehingga satu perangkat bisa dikeluarkan
// tanpa menyentuh perangkat lain (session_version hanya untuk "semua
// perangkat", misal setelah ganti/reset password). Ditulis hanya saat login,
// logout, dan pencabutan, tidak di setiap request.
//
// device_id = ID acak browser (cookie tahan lama): login ulang dari browser
// yang sama bukan "perangkat baru" (tidak ada email peringatan). Baris
// kedaluwarsa dibersihkan cron harian setelah 90 hari.
export const userSessions = pgTable(
  "user_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: varchar("device_id", { length: 36 }).notNull(),
    // Hasil baca User-Agent, mis. "Chrome di Android".
    deviceLabel: varchar("device_label", { length: 120 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    // Perkiraan kota dari IP (header Vercel), mis. "Jakarta, Indonesia".
    location: varchar("location", { length: 100 }),
    createdAt: createdAt(),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
    // LOGOUT | REVOKED (dikeluarkan dari perangkat lain) | PASSWORD | REPLACED | LIMIT
    revokedReason: varchar("revoked_reason", { length: 20 }),
  },
  (t) => [
    index("user_sessions_user_idx").on(t.userId, t.createdAt),
    index("user_sessions_expires_idx").on(t.expiresAt),
  ],
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
// Baris di tabel ini tidak boleh diubah atau dihapus oleh aplikasi, kecuali
// saat Superadmin menghapus company beserta semua datanya.
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
    // --- Absensi (BUSINESS-FLOW §18.2) ---
    // Jam kerja disimpan sebagai menit sejak pukul 00.00 waktu LOKASI absen
    // (480 = 08.00). Lokasi boleh punya jam sendiri (attendance_locations).
    workStartMinute: integer("work_start_minute").notNull().default(480),
    workEndMinute: integer("work_end_minute").notNull().default(1020),
    // Absen masuk lewat jam masuk + toleransi = terlambat.
    lateToleranceMinutes: integer("late_tolerance_minutes").notNull().default(15),
    // Denda per kejadian terlambat (0 = belum dipakai). Disalin ke setiap denda
    // saat terjadi, jadi perubahan nominal tidak mengubah denda lama.
    latePenaltyAmount: rupiah("late_penalty_amount").notNull().default(0),
    // Hari kerja sebagai bitmask: bit 0 = Senin … bit 6 = Minggu.
    // 63 = Senin–Sabtu. Lihat features/attendance/schedule.ts.
    workDays: smallint("work_days").notNull().default(63),
    // --- Cuti & izin (BUSINESS-FLOW §19) ---
    // Kuota cuti tahunan bawaan (hari kerja per tahun kalender); bisa diubah
    // per karyawan (users.annual_leave_quota).
    annualLeaveQuota: integer("annual_leave_quota").notNull().default(12),
    // Delegasi persetujuan cuti/izin ke Admin HR bila Owner belum memproses
    // setelah sekian jam (§19.4).
    leaveDelegationEnabled: boolean("leave_delegation_enabled").notNull().default(true),
    leaveDelegationHours: integer("leave_delegation_hours").notNull().default(24),
    // --- Penggajian (add-on, BUSINESS-FLOW §20.2) ---
    // Potong otomatis tidak hadir & cuti/izin tidak dibayar (butuh add-on Absensi).
    payrollAbsenceDeduction: boolean("payroll_absence_deduction").notNull().default(false),
    // Tarif per hari: WORKING_DAYS (dasar ÷ hari kerja bulan itu), FIXED_DIVISOR
    // (dasar ÷ payroll_daily_divisor), FIXED_AMOUNT (salary_profiles.daily_rate).
    payrollDailyRateMethod: varchar("payroll_daily_rate_method", { length: 20 }).notNull().default("WORKING_DAYS"),
    payrollDailyDivisor: smallint("payroll_daily_divisor").notNull().default(26),
    // Dasar tarif: BASE (gaji pokok) atau BASE_ALLOWANCES (+ tunjangan tetap bulanan).
    payrollDeductionBase: varchar("payroll_deduction_base", { length: 20 }).notNull().default("BASE"),
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
    check(
      "company_settings_work_hours",
      sql`${t.workStartMinute} between 0 and 1439 and ${t.workEndMinute} between 1 and 1439 and ${t.workStartMinute} < ${t.workEndMinute}`,
    ),
    check("company_settings_late_tolerance", sql`${t.lateToleranceMinutes} between 0 and 180`),
    check("company_settings_late_penalty", sql`${t.latePenaltyAmount} >= 0`),
    check("company_settings_work_days", sql`${t.workDays} between 1 and 127`),
    check("company_settings_leave_quota", sql`${t.annualLeaveQuota} between 0 and 60`),
    check("company_settings_leave_delegation", sql`${t.leaveDelegationHours} between 1 and 168`),
    check(
      "company_settings_payroll_method",
      sql`${t.payrollDailyRateMethod} IN ('WORKING_DAYS', 'FIXED_DIVISOR', 'FIXED_AMOUNT')`,
    ),
    check("company_settings_payroll_divisor", sql`${t.payrollDailyDivisor} between 1 and 31`),
    check("company_settings_payroll_base", sql`${t.payrollDeductionBase} IN ('BASE', 'BASE_ALLOWANCES')`),
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
    // Waktu file nota dihapus otomatis dari penyimpanan karena lewat masa
    // simpan (platform_settings.receipt_retention_months, dihitung sejak uang
    // muka Selesai). file_key & file_hash tetap disimpan: item tetap tercatat
    // "dengan nota" dan nota yang sama tetap ditolak bila diunggah ulang.
    fileDeletedAt: timestamptz("file_deleted_at"),

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
    // Tanggal uang benar-benar diterima/dibayarkan (BUSINESS-FLOW §8.1.1);
    // created_at = kapan dicatat di sistem. Null pada baris lama & baris otomatis.
    receivedOn: date("received_on"),
    // Foto/PDF bukti (opsional) di R2; dihapus otomatis oleh cron setelah masa
    // simpan (features/settlements/receipt-retention.ts), lalu proof_deleted_at diisi.
    proofKey: varchar("proof_key", { length: 255 }),
    proofContentType: varchar("proof_content_type", { length: 50 }),
    proofDeletedAt: timestamptz("proof_deleted_at"),
    // Konfirmasi karyawan atas penggantian (REIMBURSEMENT) yang dibayar
    // Owner/Finance (BUSINESS-FLOW §8.1.2): PENDING (menunggu), CONFIRMED
    // ("sudah saya terima"), DISPUTED ("belum saya terima" → dibalik oleh baris
    // REIMBURSEMENT_REVERSAL), AUTO (3 hari tanpa jawaban → dianggap diterima).
    // Null = bukan penggantian, atau dibayar lewat slip gaji (slip = buktinya).
    ackStatus: varchar("ack_status", { length: 20 }),
    ackAt: timestamptz("ack_at"),
    ackNote: varchar("ack_note", { length: 300 }),
    // Baris pembalik menunjuk baris penggantian yang dibatalkan (satu kali saja).
    reversalOf: varchar("reversal_of", { length: 36 }),
    createdById: userRef("created_by_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("advance_ledger_entries_amount_nonzero", sql`${t.amount} <> 0`),
    check(
      "advance_ledger_entries_ack_status",
      sql`${t.ackStatus} IS NULL OR ${t.ackStatus} IN ('PENDING', 'CONFIRMED', 'DISPUTED', 'AUTO')`,
    ),
    uniqueIndex("advance_ledger_entries_one_reversal").on(t.reversalOf).where(sql`${t.reversalOf} IS NOT NULL`),
    index("advance_ledger_entries_ack_pending_idx").on(t.createdAt).where(sql`${t.ackStatus} = 'PENDING'`),
    index("advance_ledger_entries_advance_idx").on(t.advanceId, t.createdAt),
    index("advance_ledger_entries_payroll_idx").on(t.companyId, t.payrollPeriod),
  ],
);

// Laporan pengembalian sisa dana dari karyawan (BUSINESS-FLOW §8.1.1). Karyawan
// melapor "saya sudah mengembalikan" beserta tanggalnya; Owner/Finance
// mengecek uangnya (mutasi/kas) lalu mengonfirmasi (→ baris RETURN di ledger)
// atau menolak. Selama PENDING, uang muka itu tidak dianggap terlambat:
// pengingat berhenti, tidak masuk Potong Gaji, dan penggajian diblokir.
//
// created_at = dilaporkan; decided_at = dikonfirmasi/ditolak; returned_on =
// tanggal menurut karyawan; received_on = tanggal diterima menurut pemeriksa.
export const returnClaims = pgTable(
  "return_claims",
  {
    id: id(),
    companyId: companyRef(),
    settlementId: varchar("settlement_id", { length: 36 })
      .notNull()
      .references(() => settlements.id),
    advanceId: varchar("advance_id", { length: 36 })
      .notNull()
      .references(() => advanceRequests.id),
    reporterId: userRef("reporter_id").notNull(),
    amount: rupiah("amount").notNull(),
    method: varchar("method", { length: 20 }).notNull(),
    returnedOn: date("returned_on").notNull(),
    note: varchar("note", { length: 300 }),
    proofKey: varchar("proof_key", { length: 255 }),
    proofContentType: varchar("proof_content_type", { length: 50 }),
    proofDeletedAt: timestamptz("proof_deleted_at"),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    createdAt: createdAt(),
    decidedAt: timestamptz("decided_at"),
    decidedById: userRef("decided_by_id"),
    rejectReason: varchar("reject_reason", { length: 500 }),
    receivedOn: date("received_on"),
    ledgerEntryId: varchar("ledger_entry_id", { length: 36 }).references(() => advanceLedgerEntries.id),
  },
  (t) => [
    check("return_claims_status_check", sql`${t.status} IN ('PENDING', 'CONFIRMED', 'REJECTED')`),
    check("return_claims_method_check", sql`${t.method} IN ('CASH', 'TRANSFER')`),
    check("return_claims_amount_check", sql`${t.amount} > 0`),
    // Satu laporan menunggu per pertanggungjawaban.
    uniqueIndex("return_claims_one_pending").on(t.settlementId).where(sql`${t.status} = 'PENDING'`),
    index("return_claims_company_status_idx").on(t.companyId, t.status, t.createdAt),
    index("return_claims_settlement_idx").on(t.settlementId, t.createdAt),
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

// Ringkasan email harian ke Owner & Finance (features/digest). Satu baris per
// user per tanggal (zona waktu perusahaan) agar cron yang berjalan dua kali
// tidak mengirim email ganda.
export const digestLogs = pgTable(
  "digest_logs",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    digestDate: date("digest_date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.digestDate] })],
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
    // Masa simpan file nota (bulan) sejak uang muka Selesai. Lewat dari itu
    // file dihapus otomatis oleh cron harian (features/settlements/receipt-retention.ts)
    // agar penyimpanan R2 tidak terus menumpuk. Company nonaktif dikecualikan.
    receiptRetentionMonths: integer("receipt_retention_months").notNull().default(6),
    // Absensi (BUSINESS-FLOW §18): ambang kecocokan wajah absen terhadap foto acuan, 0–100 (= skor
    // similarity @vladmandic/human × 100). Di bawah ini absen ditolak.
    faceMatchThreshold: integer("face_match_threshold").notNull().default(50),
    // Harga add-on per pengguna per bulan (lib/addons.ts): dikalikan jumlah
    // pengguna paket; diskon 6/12 bulan ikut berlaku.
    attendanceUserPrice: rupiah("attendance_user_price").notNull().default(5000),
    payrollUserPrice: rupiah("payroll_user_price").notNull().default(5000),
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
    check("platform_settings_receipt_retention_check", sql`${t.receiptRetentionMonths} BETWEEN 1 AND 120`),
    check("platform_settings_face_threshold_check", sql`${t.faceMatchThreshold} BETWEEN 30 AND 95`),
    check("platform_settings_attendance_price_check", sql`${t.attendanceUserPrice} >= 0`),
    check("platform_settings_payroll_price_check", sql`${t.payrollUserPrice} >= 0`),
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
// - ADDON: mengaktifkan satu add-on di tengah periode untuk `users`
//          (batas pengguna saat itu), prorata, tanpa `months`; lunas → periode
//          (starts_at–ends_at) terisi dan add-on itu aktif selama periode itu.
// `attendance` / `payroll` = tagihan ini termasuk add-on Absensi / Penggajian
// (lib/addons.ts; nama kolom = kunci add-on): pada PLAN/ADDON yang lunas,
// periodenya menentukan kapan add-on aktif (ADDON hanya memuat satu add-on);
// pada TOPUP hanya berarti harganya ikut menghitung add-on untuk pengguna tambahan.
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
    attendance: boolean("attendance").notNull().default(false),
    payroll: boolean("payroll").notNull().default(false),
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
      sql`(${t.kind} = 'PLAN' AND ${t.months} IN (1, 6, 12)) OR (${t.kind} IN ('TOPUP', 'ADDON') AND ${t.months} IS NULL)`,
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

// ---------------------------------------------------------------------------
// Absensi (BUSINESS-FLOW §18)
// ---------------------------------------------------------------------------

// Titik lokasi absensi (kantor, cabang, lokasi project). Dikelola OWNER &
// Admin HR. Tidak dihapus, hanya dinonaktifkan, agar riwayat absen tetap utuh.
export const attendanceLocations = pgTable(
  "attendance_locations",
  {
    id: id(),
    companyId: companyRef(),
    // Unik per company (lihat index di bawah).
    name: varchar("name", { length: 100 }).notNull(),
    // Opsional: lokasi milik project tertentu (informasi untuk laporan).
    projectId: varchar("project_id", { length: 36 }).references(() => projects.id),
    // Derajat desimal WGS84 (format GPS & Google Maps).
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    radiusMeters: integer("radius_meters").notNull(),
    // Zona waktu IANA (Asia/Jakarta = WIB, Asia/Makassar = WITA,
    // Asia/Jayapura = WIT). Jam & tanggal absen dihitung menurut zona ini.
    timezone: varchar("timezone", { length: 40 }).notNull().default("Asia/Jakarta"),
    // Jam kerja khusus lokasi (menit sejak 00.00). NULL = jam company.
    workStartMinute: integer("work_start_minute"),
    workEndMinute: integer("work_end_minute"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: userRef("created_by_id"),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("attendance_locations_company_name_unique").on(t.companyId, t.name),
    check("attendance_locations_latitude", sql`${t.latitude} between -90 and 90`),
    check("attendance_locations_longitude", sql`${t.longitude} between -180 and 180`),
    check("attendance_locations_radius", sql`${t.radiusMeters} between 10 and 5000`),
    check("attendance_locations_timezone", sql`${t.timezone} in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')`),
    check(
      "attendance_locations_work_hours",
      sql`(${t.workStartMinute} is null and ${t.workEndMinute} is null) or (${t.workStartMinute} between 0 and 1439 and ${t.workEndMinute} between 1 and 1439 and ${t.workStartMinute} < ${t.workEndMinute})`,
    ),
  ],
);

// Hari libur company (libur nasional, cuti bersama, dll). Hari libur tidak
// dihitung sebagai hari kerja di rekap absensi dan pengajuan cuti.
export const attendanceHolidays = pgTable(
  "attendance_holidays",
  {
    id: id(),
    companyId: companyRef(),
    date: date("date").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("attendance_holidays_company_date_unique").on(t.companyId, t.date)],
);

// Persetujuan pengolahan data wajah & lokasi (UU PDP 27/2022), satu baris
// per user. Teks yang disetujui disimpan persis sebagai bukti.
export const attendanceConsents = pgTable("attendance_consents", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: companyRef(),
  statement: text("statement").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  acceptedAt: timestamptz("accepted_at").notNull().defaultNow(),
});

// Foto acuan wajah. Satu user paling banyak punya satu foto DISETUJUI
// (APPROVED) dan satu foto MENUNGGU (PENDING): foto lama tetap dipakai
// absen sampai penggantinya disetujui, lalu baris & filenya dihapus.
// Ditolak = REJECTED (disimpan untuk menampilkan alasan, file dihapus).
export const faceProfiles = pgTable(
  "face_profiles",
  {
    id: id(),
    companyId: companyRef(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Key file di lib/storage.ts; NULL setelah file dihapus (ditolak).
    photoKey: varchar("photo_key", { length: 255 }),
    // Face embedding dari @vladmandic/human (model faceres, 1024 angka).
    embedding: real("embedding").array().notNull(),
    // Versi library/model pembuat embedding. Embedding dari versi berbeda
    // tidak bisa dibandingkan.
    modelVersion: varchar("model_version", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    rejectReason: varchar("reject_reason", { length: 300 }),
    reviewedById: userRef("reviewed_by_id"),
    reviewedAt: timestamptz("reviewed_at"),
    // Kapan Owner diberi tahu lewat WhatsApp oleh cron harian
    // (features/attendance/reminders.ts). NULL = belum; setiap foto hanya
    // diberitahukan sekali agar hemat kuota WhatsApp.
    ownerNotifiedAt: timestamptz("owner_notified_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("face_profiles_company_status_idx").on(t.companyId, t.status),
    uniqueIndex("face_profiles_one_pending")
      .on(t.userId)
      .where(sql`${t.status} = 'PENDING'`),
    uniqueIndex("face_profiles_one_approved")
      .on(t.userId)
      .where(sql`${t.status} = 'APPROVED'`),
    check("face_profiles_status_check", sql`${t.status} IN ('PENDING', 'APPROVED', 'REJECTED')`),
  ],
);

// Satu baris per user per tanggal kerja: absen masuk & pulang
// (BUSINESS-FLOW §18.5–18.8). Tanggal kerja & menit setempat dihitung dari
// zona waktu LOKASI absen masuk. Jadwal (jam masuk/pulang, toleransi) disalin
// saat absen masuk, jadi perubahan pengaturan tidak mengubah absen lama.
// Status harian (terlambat, pulang cepat, tidak absen pulang, ...) dihitung
// dari kolom-kolom ini, tidak disimpan.
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: id(),
    companyId: companyRef(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id),
    workDate: date("work_date").notNull(),
    timezone: varchar("timezone", { length: 40 }).notNull(),
    // false = bukan hari kerja (hari libur / di luar hari kerja): tidak dihitung
    // terlambat atau pulang cepat.
    isWorkDay: boolean("is_work_day").notNull(),
    scheduleStartMinute: integer("schedule_start_minute").notNull(),
    scheduleEndMinute: integer("schedule_end_minute").notNull(),
    toleranceMinutes: integer("tolerance_minutes").notNull(),

    checkInLocationId: varchar("check_in_location_id", { length: 36 })
      .notNull()
      .references(() => attendanceLocations.id),
    checkInAt: timestamptz("check_in_at").notNull(),
    checkInLatitude: doublePrecision("check_in_latitude").notNull(),
    checkInLongitude: doublePrecision("check_in_longitude").notNull(),
    checkInAccuracy: integer("check_in_accuracy").notNull(),
    checkInDistance: integer("check_in_distance").notNull(),
    checkInInRadius: boolean("check_in_in_radius").notNull(),
    checkInFaceScore: integer("check_in_face_score").notNull(),
    // 0 = tepat waktu. Dihitung dari jam masuk (bukan dari akhir toleransi).
    lateMinutes: integer("late_minutes").notNull().default(0),
    lateReason: varchar("late_reason", { length: 500 }),
    checkInOutsideReason: varchar("check_in_outside_reason", { length: 500 }),

    checkOutLocationId: varchar("check_out_location_id", { length: 36 }).references(() => attendanceLocations.id),
    checkOutAt: timestamptz("check_out_at"),
    checkOutLatitude: doublePrecision("check_out_latitude"),
    checkOutLongitude: doublePrecision("check_out_longitude"),
    checkOutAccuracy: integer("check_out_accuracy"),
    checkOutDistance: integer("check_out_distance"),
    checkOutInRadius: boolean("check_out_in_radius"),
    checkOutFaceScore: integer("check_out_face_score"),
    earlyMinutes: integer("early_minutes"),
    earlyReason: varchar("early_reason", { length: 500 }),
    checkOutOutsideReason: varchar("check_out_outside_reason", { length: 500 }),

    // "Ajukan Sanggahan / Catatan Khusus" (§18.7), bisa diisi saat masuk
    // maupun pulang (digabung). Bahan review bulanan Owner.
    appealNote: varchar("appeal_note", { length: 1000 }),
    // Koreksi Owner saat review bulanan (§18.9), misal HP karyawan mati.
    // Absen yang DIBUAT lewat koreksi tidak lewat cocok wajah: skor wajah 0.
    correctionNote: varchar("correction_note", { length: 500 }),
    correctedById: userRef("corrected_by_id"),
    correctedAt: timestamptz("corrected_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("attendance_records_user_date_unique").on(t.userId, t.workDate),
    index("attendance_records_company_date_idx").on(t.companyId, t.workDate),
    check("attendance_records_late", sql`${t.lateMinutes} >= 0`),
  ],
);

// Denda keterlambatan, satu per absen terlambat (BUSINESS-FLOW §18.2, §18.10).
// Nominal disalin dari pengaturan saat terlambat terjadi. Dibebaskan (waive),
// kunci periode, dan pencatatan potong gaji ditambahkan di irisan D.
export const attendancePenalties = pgTable(
  "attendance_penalties",
  {
    id: id(),
    companyId: companyRef(),
    recordId: varchar("record_id", { length: 36 })
      .notNull()
      .references(() => attendanceRecords.id),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id),
    // "2026-11" (bulan tanggal kerja), untuk review & potong gaji per bulan.
    period: varchar("period", { length: 7 }).notNull(),
    amount: rupiah("amount").notNull(),
    // ACTIVE (berlaku) / WAIVED (dibebaskan Owner, irisan D, atau otomatis
    // karena izin datang terlambat yang disetujui, §19.4).
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    waivedAt: timestamptz("waived_at"),
    waivedById: userRef("waived_by_id"),
    waiveNote: varchar("waive_note", { length: 300 }),
    // Ditandai sudah dipotong di menu Potong Gaji (§18.10).
    deductedAt: timestamptz("deducted_at"),
    deductedById: userRef("deducted_by_id"),
    // Periode gaji tempat denda dipotong, "2026-12".
    payrollPeriod: varchar("payroll_period", { length: 7 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("attendance_penalties_record_unique").on(t.recordId),
    index("attendance_penalties_company_period_idx").on(t.companyId, t.period),
    check("attendance_penalties_amount", sql`${t.amount} > 0`),
    check("attendance_penalties_status", sql`${t.status} IN ('ACTIVE', 'WAIVED')`),
  ],
);

// Jenis cuti/izin per company (BUSINESS-FLOW §19.1). Jenis bawaan dibuat
// bersama company (features/attendance/constants.ts → DEFAULT_LEAVE_TYPES),
// lalu dikelola Owner di Pengaturan. Tidak dihapus, hanya dinonaktifkan.
//   kind FULL_DAY      = seharian (rentang tanggal, dihitung hari kerja)
//        LATE_ARRIVAL  = izin datang terlambat (datang paling lambat jam X)
//        EARLY_LEAVE   = izin pulang cepat (pulang mulai jam X)
export const leaveTypes = pgTable(
  "leave_types",
  {
    id: id(),
    companyId: companyRef(),
    name: varchar("name", { length: 60 }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull(),
    isPaid: boolean("is_paid").notNull().default(true),
    // Mengurangi kuota cuti tahunan.
    usesQuota: boolean("uses_quota").notNull().default(false),
    // NONE / OPTIONAL / REQUIRED (foto atau PDF, misal surat dokter).
    attachment: varchar("attachment", { length: 10 }).notNull().default("NONE"),
    // Boleh diajukan mundur sampai N hari ke belakang (0 = harus sebelum hari H).
    backdateDays: integer("backdate_days").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("leave_types_company_name_unique").on(t.companyId, t.name),
    check("leave_types_kind", sql`${t.kind} IN ('FULL_DAY', 'LATE_ARRIVAL', 'EARLY_LEAVE')`),
    check("leave_types_attachment", sql`${t.attachment} IN ('NONE', 'OPTIONAL', 'REQUIRED')`),
    check("leave_types_backdate", sql`${t.backdateDays} between 0 and 30`),
  ],
);

// Pengajuan cuti/izin (BUSINESS-FLOW §19.3–19.5). Nomor IZ-2026-11-0001.
// Status: PENDING → APPROVED / REJECTED, atau CANCELLED (dibatalkan pengaju).
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: id(),
    companyId: companyRef(),
    number: varchar("number", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id),
    leaveTypeId: varchar("leave_type_id", { length: 36 })
      .notNull()
      .references(() => leaveTypes.id),
    // Salinan sifat jenis saat diajukan (jenis bisa diubah Owner kemudian).
    kind: varchar("kind", { length: 20 }).notNull(),
    isPaid: boolean("is_paid").notNull(),
    usesQuota: boolean("uses_quota").notNull(),
    startDate: date("start_date").notNull(),
    // Seharian: tanggal terakhir. Per jam: sama dengan start_date.
    endDate: date("end_date").notNull(),
    // Jumlah HARI KERJA dalam rentang (tanpa hari libur); 0 untuk izin per jam.
    days: integer("days").notNull(),
    // Izin per jam: menit setempat (datang paling lambat / pulang mulai).
    timeMinute: integer("time_minute"),
    reason: varchar("reason", { length: 500 }).notNull(),
    attachmentKey: varchar("attachment_key", { length: 255 }),
    attachmentType: varchar("attachment_type", { length: 50 }),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    decidedById: userRef("decided_by_id"),
    decidedAt: timestamptz("decided_at"),
    // true = diproses Admin HR lewat delegasi (Owner belum memproses).
    decidedByDelegate: boolean("decided_by_delegate").notNull().default(false),
    rejectReason: varchar("reject_reason", { length: 300 }),
    cancelledAt: timestamptz("cancelled_at"),
    // Kabar delegasi ke Admin HR sudah dikirim (cron, sekali per pengajuan).
    delegateNotifiedAt: timestamptz("delegate_notified_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("leave_requests_company_number_unique").on(t.companyId, t.number),
    index("leave_requests_company_status_idx").on(t.companyId, t.status),
    index("leave_requests_user_dates_idx").on(t.userId, t.startDate),
    check("leave_requests_status", sql`${t.status} IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')`),
    check("leave_requests_dates", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

// Kunci periode bulanan absensi (BUSINESS-FLOW §18.9). Setelah dikunci,
// absensi, denda, dan cuti/izin bulan itu tidak bisa diubah, dan denda yang
// masih berlaku masuk menu Potong Gaji. Baris dihapus saat kunci dibuka.
export const attendancePeriods = pgTable(
  "attendance_periods",
  {
    companyId: companyRef(),
    period: varchar("period", { length: 7 }).notNull(), // "2026-11"
    lockedAt: timestamptz("locked_at").notNull().defaultNow(),
    lockedById: userRef("locked_by_id"),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.period] })],
);

// ---------------------------------------------------------------------------
// Penggajian (add-on, BUSINESS-FLOW §20). Data gaji rahasia: hanya Owner
// (salary:manage); Superadmin tidak bisa melihat.
// ---------------------------------------------------------------------------

// Data gaji satu pengguna. Pengguna tanpa baris ini tidak ikut penggajian.
export const salaryProfiles = pgTable(
  "salary_profiles",
  {
    userId: varchar("user_id", { length: 36 })
      .primaryKey()
      .references(() => users.id),
    companyId: companyRef(),
    baseSalary: rupiah("base_salary").notNull(),
    // Hanya untuk cara tarif FIXED_AMOUNT (company_settings.payroll_daily_rate_method).
    dailyRate: rupiah("daily_rate"),
    // Masa kerja (opsional): hari kerja di luar rentang ini dipotong prorata.
    startDate: date("start_date"),
    endDate: date("end_date"),
    // true = ketidakhadiran karyawan ini tidak dipotong otomatis.
    absenceExempt: boolean("absence_exempt").notNull().default(false),
    updatedById: userRef("updated_by_id"),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("salary_profiles_company_idx").on(t.companyId),
    check("salary_profiles_amounts", sql`${t.baseSalary} >= 0 AND (${t.dailyRate} IS NULL OR ${t.dailyRate} >= 0)`),
    check(
      "salary_profiles_dates",
      sql`${t.endDate} IS NULL OR ${t.startDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
  ],
);

// Tunjangan (ALLOWANCE: tetap bulanan, atau per hari hadir bila per_day) dan
// potongan tetap (DEDUCTION, mis. BPJS/PPh 21 yang diisi manual) per pengguna.
export const salaryComponents = pgTable(
  "salary_components",
  {
    id: id(),
    companyId: companyRef(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 10 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    amount: rupiah("amount").notNull(),
    perDay: boolean("per_day").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("salary_components_user_idx").on(t.userId, t.sortOrder),
    check("salary_components_type", sql`${t.type} IN ('ALLOWANCE', 'DEDUCTION')`),
    check("salary_components_amount", sql`${t.amount} > 0`),
    check("salary_components_per_day", sql`NOT ${t.perDay} OR ${t.type} = 'ALLOWANCE'`),
  ],
);

// Penggajian satu bulan. DRAFT bisa diubah & dihitung ulang; FINALIZED =
// terkunci, slip tampil ke karyawan. Buka kunci → DRAFT lagi (baris yang
// sudah dicatat ke ledger/denda tetap tercatat).
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: id(),
    companyId: companyRef(),
    period: varchar("period", { length: 7 }).notNull(), // "2026-11"
    status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
    payDate: date("pay_date"),
    // Terakhir dihitung (dibuat / Hitung ulang).
    calculatedAt: timestamptz("calculated_at").notNull().defaultNow(),
    finalizedAt: timestamptz("finalized_at"),
    finalizedById: userRef("finalized_by_id"),
    // Finance menekan "Kirim ke Owner" (BUSINESS-FLOW §20.1). Dikosongkan lagi
    // setiap draf berubah, agar bisa dikirim ulang setelah ada perubahan.
    reviewRequestedAt: timestamptz("review_requested_at"),
    reviewRequestedById: userRef("review_requested_by_id"),
    createdById: userRef("created_by_id").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("payroll_runs_company_period_unique").on(t.companyId, t.period),
    check("payroll_runs_status", sql`${t.status} IN ('DRAFT', 'FINALIZED')`),
  ],
);

// Slip satu karyawan dalam satu penggajian. Nama & rekening disalin (snapshot)
// agar slip lama tidak berubah bila data pengguna diubah. Total dihitung
// ulang setiap baris berubah (features/salaries/payslip-math.ts).
export const payslips = pgTable(
  "payslips",
  {
    id: id(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => payrollRuns.id),
    companyId: companyRef(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id),
    fullName: varchar("full_name", { length: 100 }).notNull(),
    bankName: varchar("bank_name", { length: 50 }),
    bankAccountNumber: varchar("bank_account_number", { length: 50 }),
    // Ringkasan hari (untuk dicetak). null = tidak ada data absensi.
    workingDays: smallint("working_days").notNull().default(0),
    presentDays: smallint("present_days"),
    absentDays: smallint("absent_days"),
    unpaidLeaveDays: smallint("unpaid_leave_days"),
    dailyRate: rupiah("daily_rate"),
    totalEarnings: rupiah("total_earnings").notNull().default(0),
    totalDeductions: rupiah("total_deductions").notNull().default(0),
    netPay: rupiah("net_pay").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("payslips_run_user_unique").on(t.runId, t.userId), index("payslips_user_idx").on(t.userId)],
);

// Baris slip. `source` = asal baris (BUSINESS-FLOW §20.4):
//   BASE, ALLOWANCE, ALLOWANCE_PER_DAY, FIXED_DEDUCTION, PRORATE, ABSENCE,
//   ADVANCE (sisa uang muka; ref_id = settlement id), PENALTY (denda; ref_id =
//   bulan absen "2026-10"), MANUAL (ditambah Owner).
// Baris selain MANUAL disusun ulang saat "Hitung ulang", kecuali yang sudah
// dicatat (`posted_at`: ledger potong gaji / denda ditandai dipotong).
export const payslipLines = pgTable(
  "payslip_lines",
  {
    id: id(),
    payslipId: varchar("payslip_id", { length: 36 })
      .notNull()
      .references(() => payslips.id, { onDelete: "cascade" }),
    companyId: companyRef(),
    type: varchar("type", { length: 10 }).notNull(), // EARNING / DEDUCTION
    source: varchar("source", { length: 20 }).notNull(),
    label: varchar("label", { length: 150 }).notNull(),
    amount: rupiah("amount").notNull(),
    refId: varchar("ref_id", { length: 36 }),
    // Nominal diubah Owner (baris otomatis).
    edited: boolean("edited").notNull().default(false),
    postedAt: timestamptz("posted_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("payslip_lines_payslip_idx").on(t.payslipId, t.sortOrder),
    check("payslip_lines_type", sql`${t.type} IN ('EARNING', 'DEDUCTION')`),
    check("payslip_lines_amount", sql`${t.amount} >= 0`),
  ],
);
