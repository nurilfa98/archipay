# Arsitektur ArchiPay

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Cache Components aktif.

## 1. Struktur folder

```
archipay/
├── database/migrations/       # migration SQL hasil drizzle-kit (lihat database/README.md)
├── docs/                      # dokumentasi seperti file ini
├── public/                    # file statis (logo, gambar)
├── src/
│   ├── app/                   # ROUTING SAJA — tipis, tidak ada logika bisnis
│   │   ├── (auth)/layout.tsx               # tampilan tengah tanpa sidebar
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/layout.tsx                # sidebar + navbar untuk semua halaman setelah login
│   │   ├── (app)/page.tsx                  # beranda (/)
│   │   ├── (app)/advances/page.tsx         # (nanti)
│   │   ├── (app)/advances/[id]/page.tsx    # (nanti)
│   │   ├── api/                            # hanya untuk webhook / client eksternal
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── features/              # LOGIKA PER DOMAIN BISNIS
│   │   ├── auth/
│   │   ├── users/
│   │   ├── advances/          # advance_requests
│   │   ├── settlements/       # settlements + settlement_items
│   │   └── audit/             # audit_logs
│   ├── components/            # UI yang dipakai lintas fitur
│   │   ├── ui/                # Button, Input, Dialog (shadcn/ui)
│   │   └── layout/            # AppSidebar, AppHeader, nav-config.ts (daftar menu)
│   ├── hooks/                 # React hooks bersama (use-mobile)
│   ├── lib/                   # infrastruktur (bukan logika bisnis)
│   │   ├── db/                # koneksi + schema database
│   │   ├── auth/              # password, session, dal, roles, permissions (RBAC)
│   │   ├── audit.ts           # logAudit(), dipakai semua fitur
│   │   ├── request.ts         # getClientIp()
│   │   ├── env.ts             # validasi environment variable
│   │   └── format.ts          # formatRupiah, dll
│   ├── types/                 # tipe global (ActionResult)
│   └── proxy.ts               # (Next 16: pengganti middleware.ts) redirect cepat ke /login
```

Kenapa `src/`? Memisahkan kode aplikasi dari file konfigurasi di root.

Kenapa **feature-based** dan bukan `services/`, `controllers/`, `models/` global?
Karena semua yang berkaitan dengan "advance" ada di satu tempat. Saat aplikasi
membesar, Anda tidak perlu loncat ke 5 folder berbeda untuk satu fitur.

## 2. Isi satu folder fitur

```
features/advances/
├── components/        # AdvanceTable.tsx, AdvanceForm.tsx ("use client" bila perlu)
├── constants.ts       # status, enum
├── schemas.ts         # zod: validasi input form (dipakai client & server)
├── service.ts         # aturan bisnis MURNI (tanpa DB, tanpa Next) → mudah dites
├── queries.ts         # baca data (server-only): cek session → query DB → DTO
└── actions.ts         # "use server": validasi → otorisasi → service → simpan → revalidate
```

### Arah dependensi (aturan paling penting)

```
app/  ──►  features/  ──►  lib/
```

- `app/` boleh import dari `features/` dan `components/`.
- `features/` boleh import dari `lib/`, `components/`, `types/`.
- `lib/` tidak boleh import dari `features/` atau `app/`.
- Satu fitur sebaiknya tidak import isi internal fitur lain. Kalau perlu, pindahkan
  bagian yang dipakai bersama ke `lib/`.
- Hindari barrel file (`index.ts` yang re-export semua) — sering mencampur kode
  server dan client sehingga kode server ikut terbundel ke browser.

## 3. Alur data

### Membaca data (Server Component)

```
page.tsx (Server Component)
   └─► features/advances/queries.ts   import "server-only"
          ├─ verifySession()          ← lib/auth/dal.ts
          ├─ query DB                 ← lib/db
          └─ return DTO               ← hanya field yang dibutuhkan UI
```

```ts
// features/advances/queries.ts
import "server-only";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export async function getMyAdvances() {
  const user = await requirePermission("advance:view-own");
  const rows = await db.query.advanceRequests.findMany({
    where: (a, { eq }) => eq(a.employeeId, user.id),
  });
  // DTO: jangan kirim kolom sensitif ke client
  return rows.map((r) => ({ id: r.id, code: r.transactionCode, title: r.title, status: r.status }));
}
```

### Mengubah data (Server Action)

```
<form action={submitSettlement}>  (Client Component, useActionState)
   └─► features/settlements/actions.ts   "use server"
          1. validasi input (zod)         ← JANGAN percaya data dari client
          2. verifySession + cek role     ← autentikasi + otorisasi
          3. cek kepemilikan data         ← advance ini milik user ini?
          4. service.calculateSettlement  ← aturan bisnis
          5. simpan DB + audit log        ← dalam satu transaksi
          6. revalidate / redirect
          7. return ActionResult
```

Server Action adalah endpoint publik: siapa pun bisa memanggilnya dengan data
apa pun. Karena itu langkah 1–3 **wajib** di setiap action.

### Kapan pakai `app/api/.../route.ts`?

Hanya untuk: webhook dari pihak ketiga, endpoint yang dipanggil aplikasi lain
(mobile app), atau cron job. Untuk form di aplikasi sendiri, pakai Server Action.

## 4. Keamanan berlapis

| Lapisan              | Tugas                                                    |
| -------------------- | -------------------------------------------------------- |
| `proxy.ts`           | Cek cepat "ada cookie session?" → redirect ke /login     |
| `lib/auth/dal.ts`    | Verifikasi session sungguhan + role (sumber kebenaran)   |
| `queries`/`actions`  | Selalu panggil DAL, cek kepemilikan data                 |
| DTO                  | Hanya kirim field yang perlu ke client                   |

`proxy.ts` saja **tidak cukup** — semua pengecekan penting harus dekat ke data.

Dengan `cacheComponents: true`, komponen yang membaca `cookies()` (mis. data user
login) harus dibungkus `<Suspense>`, kalau tidak build akan error.

## 5. Uang

- Nominal disimpan sebagai **`bigint` dalam rupiah bulat**, bukan desimal dan bukan sen. Kolomnya dibuat lewat helper `rupiah()` di `lib/db/schema.ts` (`bigint(name, { mode: "number" })`), sehingga di kode bertipe `number`. Aman sampai `Number.MAX_SAFE_INTEGER` (±9 kuadriliun).
- Hitung uang hanya dengan bilangan bulat (tambah/kurang). Jangan pakai pecahan atau float: `0.1 + 0.2 !== 0.3`.
- `SUM()` di PostgreSQL mengembalikan `numeric` yang dibaca driver sebagai string, jadi hasilnya dipetakan kembali dengan `.mapWith(Number)`. Contoh: `currentBalance` di `features/settlements/queries.ts`.
- Saldo uang muka **tidak disimpan** sebagai angka, tetapi selalu dijumlahkan dari ledger `advance_ledger_entries` (tanda +/− ada di nominal). Lihat `features/settlements/ledger.ts` dan [BUSINESS-FLOW.md](./BUSINESS-FLOW.md#7-saldo--ledger).
- Tampilan memakai `formatRupiah()` dari `lib/format.ts` ("Rp 500.000"). Input nominal di form menampilkan titik ribuan, lalu server membuang semua karakter selain angka sebelum validasi.
- Contoh aturan perhitungan: `features/settlements/service.ts` (`settlementOutcome`, `summarizeBalance`).

## 6. Referensi

Dokumentasi Next.js versi yang terpasang ada di `node_modules/next/dist/docs/`:

- `01-app/01-getting-started/02-project-structure.md`
- `01-app/02-guides/authentication.md` dan `authentication-with-cache-components.md`
- `01-app/02-guides/data-security.md`
- `01-app/02-guides/forms.md`
- `01-app/01-getting-started/16-proxy.md`
