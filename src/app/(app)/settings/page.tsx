// Halaman /settings (Pengaturan): kebijakan uang muka, kategori biaya, penggajian,
// serta jam kerja/denda, hari libur, dan cuti & izin (bagian #absensi, #cuti;
// BUSINESS-FLOW §18.2, hanya bila add-on Absensi aktif).
// OWNER mengubahnya (settings:manage); superadmin hanya melihat (settings:view),
// semua isian & tombol ubah dinonaktifkan/disembunyikan. Polanya sama dengan halaman lain: judul statis di luar
// <Suspense>, cek permission & data di dalamnya.
//
// Tampilan: tiap bagian = SettingsSection (penjelasan di kiri, isian di kanan),
// dengan baris pintasan (anchor) yang menempel di atas untuk lompat antar bagian.

import { BanknoteIcon, CalendarOffIcon, ClockIcon, PlaneIcon, ReceiptTextIcon, TagsIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanySettingsForm } from "@/features/settings/components/company-settings-form";
import { AttendanceSettingsForm } from "@/features/attendance/components/attendance-settings-form";
import { HolidaysManager } from "@/features/attendance/components/holidays-manager";
import { LeaveSettingsForm, LeaveTypesManager } from "@/features/attendance/components/leave-settings";
import { getLeaveSettings, listLeaveTypes } from "@/features/attendance/leave-queries";
import { PayrollSettingsForm } from "@/features/salaries/components/payroll-settings-form";
import { getPayrollSettings } from "@/features/salaries/queries";
import { getAttendanceSettings, listHolidays } from "@/features/attendance/queries";
import { ExpenseCategoriesManager } from "@/features/settings/components/expense-categories-manager";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { getCompanySettings, getSettingsUpdateInfo, listAllExpenseCategories } from "@/features/settings/queries";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateOnly, formatDateTime, zonedDateString } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Pengaturan",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Atur kebijakan uang muka, kategori biaya, penggajian, dan absensi perusahaan."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const user = await requirePermission("settings:view");
  const readOnly = !can(user, "settings:manage");
  const showPayroll = can(user, "salary:manage");
  const showAttendance = user.company.attendance;
  const [settings, updateInfo, categories] = await Promise.all([
    getCompanySettings(user.company.id),
    getSettingsUpdateInfo(user.company.id),
    listAllExpenseCategories(user.company.id),
  ]);

  // Pintasan ke tiap bagian; bagian add-on hanya muncul bila add-on aktif.
  const jumps = [
    { id: "uang-muka", label: "Uang muka" },
    { id: "kategori", label: "Kategori biaya" },
    ...(showPayroll ? [{ id: "penggajian", label: "Penggajian" }] : []),
    ...(showAttendance
      ? [
          { id: "absensi", label: "Jam kerja & denda" },
          { id: "libur", label: "Hari libur" },
          { id: "cuti", label: "Cuti & izin" },
        ]
      : []),
  ];

  return (
    <>
      <nav
        aria-label="Bagian pengaturan"
        className="sticky top-14 z-10 -mx-4 flex gap-1.5 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur supports-backdrop-filter:bg-background/80"
      >
        {jumps.map((jump) => (
          <a
            key={jump.id}
            href={`#${jump.id}`}
            className="shrink-0 rounded-full border px-3 py-1 text-sm transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
          >
            {jump.label}
          </a>
        ))}
      </nav>

      {readOnly && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Anda hanya bisa melihat pengaturan ini. Perubahan dilakukan oleh Owner perusahaan.
        </p>
      )}

      <SettingsSection
        id="uang-muka"
        icon={BanknoteIcon}
        title="Kebijakan uang muka"
        description="Batas waktu dan batas jumlah yang berlaku untuk uang muka karyawan."
        hints={[
          "Perubahan hanya berlaku untuk uang muka yang dicairkan setelah disimpan.",
          "Uang muka yang sudah berjalan tetap memakai aturan yang disetujui karyawan saat menerima dana.",
        ]}
        meta={
          updateInfo.updatedByName
            ? `Terakhir diubah ${updateInfo.updatedByName}, ${formatDateTime(updateInfo.updatedAt)}.`
            : undefined
        }
      >
        <CompanySettingsForm settings={settings} readOnly={readOnly} />
      </SettingsSection>

      <SettingsSection
        id="kategori"
        icon={TagsIcon}
        title="Kategori biaya"
        description="Pilihan jenis pengeluaran yang dipakai karyawan saat mengisi nota di pertanggungjawaban."
        hints={["Kategori yang dinonaktifkan tidak muncul untuk nota baru, tetapi nota lama tetap aman."]}
      >
        <ExpenseCategoriesManager categories={categories} readOnly={readOnly} />
      </SettingsSection>

      {/* Penggajian: hanya Owner (data gaji rahasia) & bila add-on Penggajian aktif (lib/addons.ts). */}
      {showPayroll && (
        <SettingsSection
          id="penggajian"
          icon={ReceiptTextIcon}
          title="Penggajian"
          description="Aturan memotong gaji karena tidak hadir dan cara menghitung tarif per hari untuk slip gaji."
          hints={["Dipakai di menu Penggajian saat slip gaji bulanan disusun."]}
        >
          <PayrollSettingsForm
            settings={await getPayrollSettings(user.company.id)}
            attendanceActive={user.company.attendance}
          />
        </SettingsSection>
      )}

      {/* Tanpa add-on Absensi (lib/addons.ts), pengaturan absensi & cuti disembunyikan. */}
      {showAttendance && <AttendanceSettings companyId={user.company.id} readOnly={readOnly} />}
    </>
  );
}

async function AttendanceSettings({ companyId, readOnly }: { companyId: string; readOnly: boolean }) {
  // Hari libur tahun ini & tahun depan (tahun menurut zona waktu perusahaan).
  const year = Number(zonedDateString(new Date()).slice(0, 4));
  const [attendance, holidaysThisYear, holidaysNextYear, leaveSettings, leaveTypes] = await Promise.all([
    getAttendanceSettings(companyId),
    listHolidays(companyId, year),
    listHolidays(companyId, year + 1),
    getLeaveSettings(companyId),
    listLeaveTypes(companyId),
  ]);
  const holidays = [...holidaysThisYear, ...holidaysNextYear].map((holiday) => ({
    ...holiday,
    dateText: formatDateOnly(holiday.date),
  }));

  return (
    <>
      <SettingsSection
        id="absensi"
        icon={ClockIcon}
        title="Absensi: jam kerja & denda"
        description="Jam kerja standar, toleransi terlambat, denda keterlambatan, dan hari kerja."
        hints={[
          "Berlaku untuk semua lokasi yang tidak punya jam kerja sendiri.",
          "Denda dicatat dengan nominal saat keterlambatan terjadi.",
        ]}
      >
        <AttendanceSettingsForm settings={attendance} readOnly={readOnly} />
      </SettingsSection>

      <SettingsSection
        id="libur"
        icon={CalendarOffIcon}
        title={`Hari libur ${year}–${year + 1}`}
        description="Libur nasional, cuti bersama, atau libur perusahaan."
        hints={["Hari libur tidak dihitung sebagai hari kerja, jadi tidak ada yang dianggap tidak hadir."]}
      >
        <HolidaysManager holidays={holidays} readOnly={readOnly} />
      </SettingsSection>

      <SettingsSection
        id="cuti"
        icon={PlaneIcon}
        title="Cuti & izin"
        description="Kuota cuti tahunan, siapa yang ikut menyetujui, dan jenis cuti/izin yang bisa diajukan karyawan."
        hints={["Jenis cuti/izin yang dinonaktifkan tidak muncul di form pengajuan, tetapi pengajuan lama tetap tersimpan."]}
      >
        <div className="flex flex-col gap-6">
          <LeaveSettingsForm settings={leaveSettings} readOnly={readOnly} />
          <div className="flex flex-col gap-2 border-t pt-5">
            <h3 className="text-sm font-medium">Jenis cuti & izin</h3>
            <LeaveTypesManager types={leaveTypes} readOnly={readOnly} />
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </>
  );
}
