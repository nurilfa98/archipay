// WhatsApp penggajian (BUSINESS-FLOW §20.1): Finance menekan "Kirim ke Owner"
// → kabar langsung ke semua Owner aktif bahwa draf penggajian siap diperiksa
// dan diselesaikan. Dipanggil di dalam after() agar tombol tidak menunggu
// Fonnte. Owner tanpa nomor WhatsApp dilewati.
//
// Isi pesan sengaja TANPA nominal gaji (data gaji rahasia; WhatsApp bisa
// terbaca orang lain di layar HP).

import "server-only";
import { getOwnerContacts } from "@/features/advances/queries";
import { periodLabel } from "@/features/attendance/review-data";
import { env } from "@/lib/env";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function notifyPayrollReviewRequested(
  companyId: string,
  run: { period: string; people: number; requesterId: string; requesterName: string },
) {
  const owners = (await getOwnerContacts(companyId, [])).filter(
    (owner) => owner.id !== run.requesterId && owner.phoneNumber,
  );
  const link = new URL(`/payroll/${run.period}`, env.NEXT_PUBLIC_APP_URL).toString();
  const results = await Promise.allSettled(
    owners.map((owner) =>
      sendWhatsApp({
        to: owner.phoneNumber!,
        text:
          `Halo ${owner.fullName},\n\n${run.requesterName} sudah menyiapkan *Penggajian ${periodLabel(run.period)}* ` +
          `(${run.people} karyawan). Periksa lalu selesaikan di ArchiPay:\n${link}`,
      }),
    ),
  );
  const failed = results.filter((result) => result.status === "rejected" || !result.value).length;
  if (failed > 0) console.error(`[payroll] ${failed} kabar penggajian ke Owner gagal dikirim`);
}
