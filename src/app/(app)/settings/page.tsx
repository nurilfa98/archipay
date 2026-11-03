// Halaman /settings (Pengaturan): kebijakan uang muka, kategori biaya, serta
// jam kerja/denda & hari libur absensi (bagian #absensi, BUSINESS-FLOW §18.2; hanya bila add-on Absensi aktif).
// OWNER mengubahnya (settings:manage); superadmin hanya melihat (settings:view),
// semua isian & tombol ubah dinonaktifkan/disembunyikan. Polanya sama dengan halaman lain: judul statis di luar
// <Suspense>, cek permission & data di dalamnya.

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <PageHeader title="Pengaturan" description="Kebijakan uang muka, kategori biaya, dan absensi perusahaan." />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const user = await requirePermission("settings:view");
  const readOnly = !can(user, "settings:manage");
  const [settings, updateInfo, categories] = await Promise.all([
    getCompanySettings(user.company.id),
    getSettingsUpdateInfo(user.company.id),
    listAllExpenseCategories(user.company.id),
  ]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Kebijakan uang muka</CardTitle>
          <CardDescription>
            Perubahan hanya berlaku untuk uang muka yang dicairkan setelah disimpan. Uang muka yang sudah
            berjalan tetap memakai aturan yang disetujui karyawan saat menerima dana.
            {updateInfo.updatedByName &&
              ` Terakhir diubah ${updateInfo.updatedByName}, ${formatDateTime(updateInfo.updatedAt)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanySettingsForm settings={settings} readOnly={readOnly} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kategori biaya</CardTitle>
          <CardDescription>Dipilih karyawan untuk setiap nota di pertanggungjawaban.</CardDescription>
        </CardHeader>
        <CardContent>
          <ExpenseCategoriesManager categories={categories} readOnly={readOnly} />
        </CardContent>
      </Card>

      {/* Penggajian: hanya Owner (data gaji rahasia) & bila add-on Penggajian aktif (lib/addons.ts). */}
      {can(user, "salary:manage") && (
        <Card id="penggajian" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Penggajian</CardTitle>
            <CardDescription>
              Potong otomatis ketidakhadiran dan cara menghitung tarif per hari untuk slip gaji (menu Penggajian).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PayrollSettingsForm
              settings={await getPayrollSettings(user.company.id)}
              attendanceActive={user.company.attendance}
            />
          </CardContent>
        </Card>
      )}

      {/* Tanpa add-on Absensi (lib/addons.ts), pengaturan absensi & cuti disembunyikan. */}
      {user.company.attendance && <AttendanceSettings companyId={user.company.id} readOnly={readOnly} />}
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
      <Card id="absensi" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Absensi: jam kerja & denda</CardTitle>
          <CardDescription>
            Berlaku untuk semua lokasi yang tidak punya jam kerja sendiri. Denda dicatat dengan nominal saat
            keterlambatan terjadi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttendanceSettingsForm settings={attendance} readOnly={readOnly} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Hari libur {year}–{year + 1}
          </CardTitle>
          <CardDescription>Libur nasional, cuti bersama, atau libur perusahaan. Tidak dihitung hari kerja.</CardDescription>
        </CardHeader>
        <CardContent>
          <HolidaysManager holidays={holidays} readOnly={readOnly} />
        </CardContent>
      </Card>

      <Card id="cuti" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Cuti & izin</CardTitle>
          <CardDescription>
            Kuota cuti tahunan, delegasi persetujuan ke Admin HR, dan jenis cuti/izin yang bisa diajukan karyawan.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <LeaveSettingsForm settings={leaveSettings} readOnly={readOnly} />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Jenis cuti & izin</h3>
            <LeaveTypesManager types={leaveTypes} readOnly={readOnly} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </>
  );
}
