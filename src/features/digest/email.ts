// Isi email ringkasan harian (Owner & Finance), BUSINESS-FLOW §10.
// Gaya tampilan sama dengan email ArchiPay lain (features/users/emails.ts):
// HTML sederhana dengan style inline + versi teks polos.

import "server-only";
import { escapeHtml, type EmailMessage } from "@/lib/email";
import { env } from "@/lib/env";
import { formatRupiah } from "@/lib/format";
import type { DigestData } from "./queries";

export type DigestAudience = "owner" | "finance";

type Row = { cells: string[]; href: string; warn?: string };
type Section = { title: string; rows: Row[]; note?: string };

const dayFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: env.APP_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat("id-ID", {
  timeZone: env.APP_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "short",
});

const url = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
const who = (name: string, project: string | null) => (project ? `${name} · ${project}` : name);

// null = tidak ada isi untuk penerima ini (email tidak dikirim).
export function digestEmail(input: {
  to: string;
  fullName: string;
  companyName: string;
  audience: DigestAudience;
  data: DigestData;
  now: Date;
}): EmailMessage | null {
  const { data, audience } = input;
  const sections: Section[] = [];

  if (audience === "owner") {
    const rows: Row[] = [
      ...data.pendingApprovals.map((advance) => ({
        cells: [advance.number, who(advance.recipientName, advance.projectName), formatRupiah(advance.amount)],
        href: url(`/advances/${advance.id}`),
      })),
      ...data.pendingLeaves.map((leave) => ({
        cells: [
          leave.number,
          `${leave.fullName} · ${leave.typeName}`,
          leave.startDate === leave.endDate ? leave.startDate : `${leave.startDate} s.d. ${leave.endDate}`,
        ],
        href: url("/attendance/leave"),
      })),
      ...data.pendingFaces.map((face) => ({
        cells: ["Foto wajah", face.fullName, `menunggu sejak ${shortDate.format(face.createdAt)}`],
        href: url("/attendance/faces"),
      })),
    ];
    if (rows.length) sections.push({ title: "Perlu persetujuan Anda", rows });
  }
  if (data.awaitingVerification.length) {
    sections.push({
      title: "Pertanggungjawaban menunggu verifikasi",
      rows: data.awaitingVerification.map((settlement) => ({
        cells: [
          settlement.number,
          who(settlement.recipientName, settlement.projectName),
          formatRupiah(settlement.total),
        ],
        href: url(`/settlements/${settlement.id}`),
        warn: settlement.late ? "terlambat" : undefined,
      })),
    });
  }
  if (data.approvedNotDisbursed.length) {
    sections.push({
      title: "Sudah disetujui, belum dicairkan",
      rows: data.approvedNotDisbursed.map((advance) => ({
        cells: [advance.number, who(advance.recipientName, advance.projectName), formatRupiah(advance.amount)],
        href: url(`/advances/${advance.id}`),
      })),
    });
  }
  if (data.newlyOverdue.length) {
    sections.push({
      title: "Lewat batas",
      rows: data.newlyOverdue.map((item) =>
        item.kind === "SETTLEMENT_OVERDUE"
          ? {
              cells: [
                item.advanceNumber,
                item.recipientName,
                `nota belum dikirim${item.dueAt ? `, batas ${shortDate.format(item.dueAt)}` : ""}`,
              ],
              href: url(item.settlementId ? `/settlements/${item.settlementId}` : `/advances/${item.advanceId}`),
            }
          : {
              cells: [
                item.settlementNumber ?? item.advanceNumber,
                item.recipientName,
                `sisa ${formatRupiah(item.balance)} masuk daftar Potong Gaji`,
              ],
              href: url("/payroll-deductions"),
            },
      ),
    });
  }

  const attention = sections.reduce((total, section) => total + section.rows.length, 0);
  const acknowledged = data.acknowledged;
  if (attention === 0 && acknowledged.length === 0) return null;

  const day = dayFormat.format(input.now);
  const subject =
    attention > 0 ? `Ringkasan ArchiPay – ${day}: ${attention} hal perlu perhatian` : `Ringkasan ArchiPay – ${day}`;
  const yesterday =
    acknowledged.length > 0
      ? `${acknowledged.length} karyawan mengonfirmasi terima dana: ${acknowledged
          .map((advance) => `${advance.recipientName} (${advance.number})`)
          .join(", ")}`
      : null;
  const footer =
    audience === "owner"
      ? "Email ini dikirim setiap pagi hanya bila ada yang perlu Anda lihat. Pengajuan uang muka dan laporan dana tidak sesuai tetap dikirim langsung lewat WhatsApp."
      : "Email ini dikirim setiap pagi hanya bila ada yang perlu Anda lihat.";

  const text = [
    `Halo ${input.fullName},`,
    "",
    `Berikut ringkasan ${input.companyName} per pagi ini.`,
    ...sections.flatMap((section) => [
      "",
      `${section.title} (${section.rows.length})`,
      ...section.rows.map((row) => `- ${row.cells.join(" | ")}${row.warn ? ` (${row.warn})` : ""}\n  ${row.href}`),
    ]),
    ...(yesterday ? ["", "Kemarin", `- ${yesterday}`] : []),
    "",
    `Buka ArchiPay: ${url("/")}`,
    "",
    footer,
  ].join("\n");

  const td = "padding: 6px 12px 6px 0; border-bottom: 1px solid #e5e5e5; vertical-align: top;";
  const html = `
<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #171717;">
  <p>Halo ${escapeHtml(input.fullName)},</p>
  <p>Berikut ringkasan ${escapeHtml(input.companyName)} per pagi ini.</p>
  ${sections
    .map(
      (section) => `
  <h3 style="font-size: 15px; margin: 20px 0 6px;">${escapeHtml(section.title)} (${section.rows.length})</h3>
  <table style="border-collapse: collapse; width: 100%;">
    ${section.rows
      .map(
        (row) => `<tr>
      <td style="${td} white-space: nowrap;"><a href="${escapeHtml(row.href)}" style="color: #4f46e5;">${escapeHtml(row.cells[0])}</a></td>
      <td style="${td}">${escapeHtml(row.cells[1])}${row.warn ? ` <span style="color: #b45309;">&#9888; ${escapeHtml(row.warn)}</span>` : ""}</td>
      <td style="${td} text-align: right; white-space: nowrap;">${escapeHtml(row.cells[2])}</td>
    </tr>`,
      )
      .join("")}
  </table>`,
    )
    .join("")}
  ${yesterday ? `<h3 style="font-size: 15px; margin: 20px 0 6px;">Kemarin</h3><p style="margin: 0;">${escapeHtml(yesterday)}</p>` : ""}
  <p style="margin-top: 20px;"><a href="${escapeHtml(url("/"))}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 8px 16px; border-radius: 6px; text-decoration: none;">Buka ArchiPay</a></p>
  <p style="color: #737373; font-size: 12px;">${escapeHtml(footer)}</p>
</div>`;

  return { to: input.to, subject, text, html };
}
