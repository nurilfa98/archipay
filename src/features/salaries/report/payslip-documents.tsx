// Dokumen PDF Penggajian (@react-pdf/renderer, BUSINESS-FLOW §20.5):
// - PayslipsDocument: Slip Gaji, satu halaman A4 tegak per karyawan (satu
//   slip untuk karyawan, atau semua slip untuk dicetak Owner);
// - PayrollRecapDocument: rekap satu bulan per karyawan + total company.
// Aturan PDF sama dengan features/projects/report/project-report-document.tsx:
// font Helvetica bawaan (karakter khusus diganti, lihat pdfText), tidak
// membaca database/env, hanya menerima data jadi.

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatRupiah } from "@/lib/format";

const COLORS = { ink: "#0f172a", muted: "#64748b", line: "#e2e8f0", soft: "#f1f5f9", accent: "#4f46e5" };

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: COLORS.ink,
  },
  eyebrow: { fontSize: 8, color: COLORS.accent, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 4 },
  meta: { fontSize: 8.5, color: COLORS.muted, marginTop: 3 },
  header: { borderBottomWidth: 1.5, borderBottomColor: COLORS.accent, paddingBottom: 10, marginBottom: 14 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  infoItem: { width: "50%", marginBottom: 6 },
  label: { fontSize: 7.5, color: COLORS.muted },
  value: { fontSize: 10, marginTop: 1 },
  sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
    paddingVertical: 4,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  netBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 10,
    backgroundColor: COLORS.soft,
    borderRadius: 4,
  },
  netLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  netValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLORS.accent },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: COLORS.muted },
  right: { textAlign: "right" },
  note: { fontSize: 8, color: COLORS.muted, marginTop: 14 },
  tableHead: { flexDirection: "row", backgroundColor: COLORS.soft, paddingVertical: 4, paddingHorizontal: 4 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: COLORS.muted },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.muted,
  },
});

// Font standar PDF tidak punya semua karakter Unicode.
function pdfText(value: string) {
  return value.replace(/×/g, "x").replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[“”]/g, '"');
}

export type PayslipDocLine = { label: string; amount: number };

export type PayslipDoc = {
  fullName: string;
  bankText: string;
  daysText: string;
  earnings: PayslipDocLine[];
  deductions: PayslipDocLine[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
};

export type PayrollDocMeta = {
  companyName: string;
  companyAddress: string | null;
  periodLabel: string;
  payDateText: string;
  generatedAt: string;
};

export function PayslipsDocument({ meta, slips }: { meta: PayrollDocMeta; slips: PayslipDoc[] }) {
  return (
    <Document title={`Slip gaji ${meta.periodLabel}`} author="ArchiPay">
      {slips.map((slip, index) => (
        <Page key={index} size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>SLIP GAJI</Text>
            <Text style={styles.title}>{pdfText(meta.companyName)}</Text>
            {meta.companyAddress && <Text style={styles.meta}>{pdfText(meta.companyAddress)}</Text>}
          </View>

          <View style={styles.infoGrid}>
            <Info label="Nama" value={slip.fullName} />
            <Info label="Periode" value={meta.periodLabel} />
            <Info label="Rekening tujuan" value={slip.bankText} />
            <Info label="Tanggal bayar" value={meta.payDateText} />
            <View style={{ width: "100%" }}>
              <Text style={styles.label}>Kehadiran</Text>
              <Text style={styles.value}>{pdfText(slip.daysText)}</Text>
            </View>
          </View>

          <LineSection title="Pendapatan" lines={slip.earnings} total={slip.totalEarnings} />
          <LineSection title="Potongan" lines={slip.deductions} total={slip.totalDeductions} />

          <View style={styles.netBox}>
            <Text style={styles.netLabel}>Gaji bersih (take-home pay)</Text>
            <Text style={styles.netValue}>{formatRupiah(slip.netPay)}</Text>
          </View>

          <Text style={styles.note}>
            Slip ini dibuat oleh sistem ArchiPay sebagai bukti pembayaran upah beserta rinciannya dan sah tanpa tanda
            tangan.
          </Text>

          <View style={styles.footer} fixed>
            <Text>
              ArchiPay | Slip gaji {meta.periodLabel} | {pdfText(slip.fullName)}
            </Text>
            <Text>Dibuat {meta.generatedAt}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{pdfText(value)}</Text>
    </View>
  );
}

function LineSection({ title, lines, total }: { title: string; lines: PayslipDocLine[]; total: number }) {
  return (
    <View wrap={false}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {lines.length === 0 ? (
        <View style={styles.row}>
          <Text style={styles.muted}>-</Text>
          <Text>{formatRupiah(0)}</Text>
        </View>
      ) : (
        lines.map((line, index) => (
          <View key={index} style={styles.row}>
            <Text style={{ width: "75%" }}>{pdfText(line.label)}</Text>
            <Text style={[styles.right, { width: "25%" }]}>{formatRupiah(line.amount)}</Text>
          </View>
        ))
      )}
      <View style={styles.totalRow}>
        <Text style={styles.bold}>Total {title.toLowerCase()}</Text>
        <Text style={styles.bold}>{formatRupiah(total)}</Text>
      </View>
    </View>
  );
}

export type RecapRow = {
  fullName: string;
  bankText: string;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
};

const RECAP_COLUMNS = [
  { label: "Karyawan", width: "26%" },
  { label: "Rekening", width: "26%" },
  { label: "Pendapatan", width: "16%", right: true },
  { label: "Potongan", width: "16%", right: true },
  { label: "Gaji bersih", width: "16%", right: true },
];

export function PayrollRecapDocument({
  meta,
  rows,
  statusText,
  generatedBy,
}: {
  meta: PayrollDocMeta;
  rows: RecapRow[];
  statusText: string;
  generatedBy: string;
}) {
  const totals = rows.reduce(
    (sum, row) => ({
      earnings: sum.earnings + row.totalEarnings,
      deductions: sum.deductions + row.totalDeductions,
      net: sum.net + row.netPay,
    }),
    { earnings: 0, deductions: 0, net: 0 },
  );
  return (
    <Document title={`Rekap penggajian ${meta.periodLabel}`} author="ArchiPay">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>REKAP PENGGAJIAN</Text>
          <Text style={styles.title}>
            {pdfText(meta.companyName)} - {meta.periodLabel}
          </Text>
          <Text style={styles.meta}>
            {statusText} | Tanggal bayar {meta.payDateText} | Dibuat {meta.generatedAt} oleh {pdfText(generatedBy)}
          </Text>
        </View>

        <View style={styles.tableHead} fixed>
          {RECAP_COLUMNS.map((column) => (
            <Text key={column.label} style={[styles.th, { width: column.width }, column.right ? styles.right : {}]}>
              {column.label}
            </Text>
          ))}
        </View>
        {rows.map((row, index) => {
          const cells = [
            pdfText(row.fullName),
            pdfText(row.bankText),
            formatRupiah(row.totalEarnings),
            formatRupiah(row.totalDeductions),
            formatRupiah(row.netPay),
          ];
          return (
            <View key={index} style={styles.tableRow} wrap={false}>
              {cells.map((cell, cellIndex) => (
                <Text
                  key={cellIndex}
                  style={[
                    { width: RECAP_COLUMNS[cellIndex].width },
                    RECAP_COLUMNS[cellIndex].right ? styles.right : {},
                  ]}
                >
                  {cell}
                </Text>
              ))}
            </View>
          );
        })}
        <View style={styles.tableRow}>
          <Text style={[styles.bold, { width: "52%" }]}>Total ({rows.length} karyawan)</Text>
          <Text style={[styles.bold, styles.right, { width: "16%" }]}>{formatRupiah(totals.earnings)}</Text>
          <Text style={[styles.bold, styles.right, { width: "16%" }]}>{formatRupiah(totals.deductions)}</Text>
          <Text style={[styles.bold, styles.right, { width: "16%" }]}>{formatRupiah(totals.net)}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>ArchiPay | Rekap penggajian {meta.periodLabel}</Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
