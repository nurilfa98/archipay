// Dokumen PDF rekap absensi bulanan (@react-pdf/renderer), A4 lanskap
// (BUSINESS-FLOW §18.9): rekap per karyawan lalu daftar denda keterlambatan.
// Aturan PDF sama dengan features/projects/report/project-report-document.tsx:
// font Helvetica bawaan (hindari karakter khusus), baris berukuran tetap.
// Tidak membaca database/env, hanya menerima data jadi.

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatRupiah } from "@/lib/format";

const COLORS = { ink: "#0f172a", muted: "#64748b", line: "#e2e8f0", soft: "#f1f5f9", accent: "#4f46e5" };

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 32,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: COLORS.ink,
  },
  eyebrow: { fontSize: 8, color: COLORS.accent, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 4 },
  meta: { fontSize: 8, color: COLORS.muted, marginTop: 4 },
  header: { borderBottomWidth: 1.5, borderBottomColor: COLORS.accent, paddingBottom: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  tableHead: { flexDirection: "row", backgroundColor: COLORS.soft, paddingVertical: 4, paddingHorizontal: 4 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: COLORS.muted },
  right: { textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  empty: { fontSize: 9, color: COLORS.muted, paddingVertical: 8 },
  footer: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.muted,
  },
});

export type ReportSummaryRow = {
  fullName: string;
  present: number;
  lateCount: number;
  lateMinutes: number;
  earlyCount: number;
  outsideCount: number;
  noCheckout: number;
  absent: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  penaltyTotal: number;
  waivedCount: number;
};

export type ReportPenaltyRow = {
  fullName: string;
  dateText: string;
  lateMinutes: number;
  amount: number;
  statusText: string;
};

const SUMMARY_COLUMNS: { label: string; width: string; right?: boolean }[] = [
  { label: "Karyawan", width: "22%" },
  { label: "Hadir", width: "7%", right: true },
  { label: "Terlambat", width: "12%", right: true },
  { label: "Pulang cepat", width: "8%", right: true },
  { label: "Luar radius", width: "8%", right: true },
  { label: "Tdk absen pulang", width: "9%", right: true },
  { label: "Tidak hadir", width: "8%", right: true },
  { label: "Cuti dibayar", width: "8%", right: true },
  { label: "Cuti tdk dibayar", width: "8%", right: true },
  { label: "Denda", width: "10%", right: true },
];

export function AttendanceReportDocument({
  companyName,
  periodLabel,
  lockText,
  generatedAt,
  generatedBy,
  summaries,
  penalties,
}: {
  companyName: string;
  periodLabel: string;
  lockText: string;
  generatedAt: string;
  generatedBy: string;
  summaries: ReportSummaryRow[];
  penalties: ReportPenaltyRow[];
}) {
  const total = summaries.reduce((sum, row) => sum + row.penaltyTotal, 0);
  return (
    <Document title={`Rekap absensi ${periodLabel}`} author="ArchiPay">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>REKAP ABSENSI</Text>
          <Text style={styles.title}>
            {companyName} - {periodLabel}
          </Text>
          <Text style={styles.meta}>
            {lockText} | Dibuat {generatedAt} oleh {generatedBy}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Rekap per karyawan</Text>
        <View style={styles.tableHead} fixed>
          {SUMMARY_COLUMNS.map((column) => (
            <Text key={column.label} style={[styles.th, { width: column.width }, column.right ? styles.right : {}]}>
              {column.label}
            </Text>
          ))}
        </View>
        {summaries.length === 0 ? (
          <Text style={styles.empty}>Belum ada karyawan yang wajib absen.</Text>
        ) : (
          summaries.map((row) => {
            const cells = [
              row.fullName,
              String(row.present),
              row.lateCount ? `${row.lateCount}x (${row.lateMinutes} mnt)` : "-",
              String(row.earlyCount || "-"),
              String(row.outsideCount || "-"),
              String(row.noCheckout || "-"),
              String(row.absent || "-"),
              String(row.paidLeaveDays || "-"),
              String(row.unpaidLeaveDays || "-"),
              row.penaltyTotal ? formatRupiah(row.penaltyTotal) : "-",
            ];
            return (
              <View key={row.fullName} style={styles.row} wrap={false}>
                {cells.map((cell, index) => (
                  <Text
                    key={index}
                    style={[{ width: SUMMARY_COLUMNS[index].width }, SUMMARY_COLUMNS[index].right ? styles.right : {}]}
                  >
                    {cell}
                  </Text>
                ))}
              </View>
            );
          })
        )}
        <View style={styles.row}>
          <Text style={[styles.bold, { width: "90%" }]}>Total denda berlaku</Text>
          <Text style={[styles.bold, styles.right, { width: "10%" }]}>{formatRupiah(total)}</Text>
        </View>

        <Text style={styles.sectionTitle} break={summaries.length > 18}>
          Denda keterlambatan
        </Text>
        <View style={styles.tableHead} fixed>
          <Text style={[styles.th, { width: "30%" }]}>Karyawan</Text>
          <Text style={[styles.th, { width: "20%" }]}>Tanggal</Text>
          <Text style={[styles.th, styles.right, { width: "15%" }]}>Terlambat</Text>
          <Text style={[styles.th, styles.right, { width: "15%" }]}>Denda</Text>
          <Text style={[styles.th, { width: "20%", paddingLeft: 8 }]}>Status</Text>
        </View>
        {penalties.length === 0 ? (
          <Text style={styles.empty}>Tidak ada denda bulan ini.</Text>
        ) : (
          penalties.map((row, index) => (
            <View key={index} style={styles.row} wrap={false}>
              <Text style={{ width: "30%" }}>{row.fullName}</Text>
              <Text style={{ width: "20%" }}>{row.dateText}</Text>
              <Text style={[styles.right, { width: "15%" }]}>{row.lateMinutes} mnt</Text>
              <Text style={[styles.right, { width: "15%" }]}>{formatRupiah(row.amount)}</Text>
              <Text style={{ width: "20%", paddingLeft: 8 }}>{row.statusText}</Text>
            </View>
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>ArchiPay | Rekap absensi {periodLabel}</Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
