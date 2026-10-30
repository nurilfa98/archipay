// Dokumen PDF laporan satu project (@react-pdf/renderer), A4 potret.
//
// Isi: ringkasan keuangan, rincian per kategori dan per karyawan, lalu daftar
// nota yang disetujui. Foto nota tidak disertakan.
//
// Aturan khusus PDF:
// - Font bawaan Helvetica hanya memuat karakter Latin standar. Hindari tanda
//   seperti "≥", "−", atau emoji; pakai teks biasa.
// - Daftar nota dipecah per halaman dengan baris berukuran tetap, supaya judul
//   kolom bisa diulang di setiap halaman (react-pdf belum punya header tabel
//   yang berulang).
//
// File ini tidak membaca database atau env, hanya menerima data jadi, sehingga
// bisa dirender di mana saja.
//
// Referensi: https://react-pdf.org/components

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { formatRupiah, MONTH_NAMES } from "@/lib/format";
import type { ProjectReport, ReportReceipt } from "../report-queries";

const COLORS = {
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  soft: "#f1f5f9",
  accent: "#4f46e5",
  danger: "#be123c",
};

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 54, paddingHorizontal: 36, fontSize: 9, fontFamily: "Helvetica", color: COLORS.ink },
  eyebrow: { fontSize: 8, color: COLORS.accent, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 4 },
  subtitle: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  meta: { fontSize: 8, color: COLORS.muted, marginTop: 6 },
  header: { borderBottomWidth: 1.5, borderBottomColor: COLORS.accent, paddingBottom: 10, marginBottom: 14 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  box: { width: "33.33%", paddingHorizontal: 4, marginBottom: 8 },
  boxInner: { backgroundColor: COLORS.soft, borderRadius: 4, padding: 8 },
  boxLabel: { fontSize: 8, color: COLORS.muted },
  boxValue: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 3 },
  boxNote: { fontSize: 7.5, color: COLORS.muted, marginTop: 2 },
  tableHead: { flexDirection: "row", backgroundColor: COLORS.soft, borderRadius: 2, paddingVertical: 4, paddingHorizontal: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLORS.line, paddingVertical: 4, paddingHorizontal: 4, minHeight: 18 },
  rowTotal: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4 },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: COLORS.muted },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  empty: { fontSize: 9, color: COLORS.muted, paddingVertical: 8 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: COLORS.muted },
});

// Jumlah baris nota per halaman (tinggi baris tetap, lihat catatan di atas).
const ROWS_PER_PAGE = 32;

export function ProjectReportDocument({
  report,
  generatedAt,
  generatedBy,
}: {
  report: ProjectReport;
  generatedAt: string;
  generatedBy: string;
}) {
  const { project, summary, categories, employees, receipts } = report;
  const pages = chunk(receipts, ROWS_PER_PAGE);
  const provisional = project.status === "ACTIVE";

  return (
    <Document title={`Laporan Project ${project.name}`} author="ArchiPay" creator="ArchiPay">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>LAPORAN PROJECT</Text>
          <Text style={styles.title}>{project.name}</Text>
          <Text style={styles.subtitle}>
            {project.client ? `Klien: ${project.client}` : "Tanpa nama klien"} | Status:{" "}
            {provisional ? "Aktif" : "Selesai"}
          </Text>
          <Text style={styles.meta}>
            Dicetak {generatedAt} oleh {generatedBy}
          </Text>
        </View>

        <View style={styles.grid}>
          <Box
            label="Nilai kontrak"
            value={summary.contractValue === null ? "Belum diisi" : money(summary.contractValue)}
          />
          <Box
            label="Pengeluaran"
            value={money(summary.expense)}
            note={
              summary.usedPercent !== null
                ? `${percent(summary.usedPercent)} dari nilai kontrak`
                : "Nota yang sudah disetujui"
            }
          />
          <Box
            label={provisional ? "Keuntungan (sementara)" : "Keuntungan (final)"}
            value={summary.profit === null ? "-" : money(summary.profit)}
            note={summary.marginPercent !== null ? `Margin ${percent(summary.marginPercent)}` : undefined}
            danger={summary.profit !== null && summary.profit < 0}
          />
          <Box label="Dana beredar" value={money(summary.outstanding)} note="Sudah cair, nota belum diverifikasi" />
          <Box
            label="Uang muka dicairkan"
            value={`${summary.advanceCount} uang muka`}
            note={`Total ${money(summary.disbursedTotal)}`}
          />
          <Box label="Nota disetujui" value={`${summary.receiptCount} nota`} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pengeluaran per kategori</Text>
          {categories.length === 0 ? (
            <Text style={styles.empty}>Belum ada nota yang disetujui.</Text>
          ) : (
            <>
              <TableHead
                cells={[
                  { label: "Kategori", flex: 4 },
                  { label: "Nota", flex: 1, right: true },
                  { label: "Total", flex: 2.5, right: true },
                  { label: "Porsi", flex: 1.2, right: true },
                ]}
              />
              {categories.map((category) => (
                <View key={category.name} style={styles.row} wrap={false}>
                  <Cell flex={4}>{category.name}</Cell>
                  <Cell flex={1} right>
                    {String(category.count)}
                  </Cell>
                  <Cell flex={2.5} right>
                    {money(category.amount)}
                  </Cell>
                  <Cell flex={1.2} right>
                    {percent((category.amount / summary.expense) * 100)}
                  </Cell>
                </View>
              ))}
              <View style={styles.rowTotal}>
                <Cell flex={5} bold>
                  Total
                </Cell>
                <Cell flex={2.5} right bold>
                  {money(summary.expense)}
                </Cell>
                <Cell flex={1.2} right>
                  {""}
                </Cell>
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Per karyawan</Text>
          {employees.length === 0 ? (
            <Text style={styles.empty}>Belum ada uang muka yang dicairkan.</Text>
          ) : (
            <>
              <TableHead
                cells={[
                  { label: "Karyawan", flex: 4 },
                  { label: "Uang muka", flex: 1.5, right: true },
                  { label: "Dicairkan", flex: 2.5, right: true },
                  { label: "Pengeluaran disetujui", flex: 2.7, right: true },
                ]}
              />
              {employees.map((employee) => (
                <View key={employee.name} style={styles.row} wrap={false}>
                  <Cell flex={4}>{employee.name}</Cell>
                  <Cell flex={1.5} right>
                    {String(employee.advances)}
                  </Cell>
                  <Cell flex={2.5} right>
                    {money(employee.disbursed)}
                  </Cell>
                  <Cell flex={2.7} right>
                    {money(employee.expense)}
                  </Cell>
                </View>
              ))}
            </>
          )}
        </View>

        <Footer projectName={project.name} />
      </Page>

      {receipts.length === 0 ? null : (
        <>
          {pages.map((rows, index) => (
            <Page key={index} size="A4" style={styles.page}>
              <Text style={styles.sectionTitle}>
                Daftar nota disetujui{index > 0 ? " (lanjutan)" : ""}
              </Text>
              <ReceiptHead />
              {rows.map((receipt, rowIndex) => (
                <ReceiptRow key={rowIndex} receipt={receipt} />
              ))}
              {index === pages.length - 1 && (
                <View style={styles.rowTotal}>
                  <Cell flex={1} bold>
                    Total {receipts.length} nota
                  </Cell>
                  <Cell width={RECEIPT_COLUMNS.amount} right bold>
                    {money(summary.expense)}
                  </Cell>
                </View>
              )}
              <Footer projectName={project.name} />
            </Page>
          ))}
        </>
      )}
    </Document>
  );
}

// Lebar kolom daftar nota (total 523pt = lebar A4 dikurangi margin).
const RECEIPT_COLUMNS = { date: 50, number: 76, employee: 88, category: 72, description: 147, amount: 90 };

function ReceiptHead() {
  return (
    <View style={styles.tableHead}>
      <Cell width={RECEIPT_COLUMNS.date} head>
        Tanggal
      </Cell>
      <Cell width={RECEIPT_COLUMNS.number} head>
        No. PJ
      </Cell>
      <Cell width={RECEIPT_COLUMNS.employee} head>
        Karyawan
      </Cell>
      <Cell width={RECEIPT_COLUMNS.category} head>
        Kategori
      </Cell>
      <Cell width={RECEIPT_COLUMNS.description} head>
        Keterangan
      </Cell>
      <Cell width={RECEIPT_COLUMNS.amount} head right>
        Jumlah
      </Cell>
    </View>
  );
}

function ReceiptRow({ receipt }: { receipt: ReportReceipt }) {
  const description = receipt.hasReceipt ? receipt.description : `${receipt.description} (tanpa nota)`;
  return (
    <View style={[styles.row, { fontSize: 8 }]} wrap={false}>
      <Cell width={RECEIPT_COLUMNS.date}>{shortDate(receipt.date)}</Cell>
      <Cell width={RECEIPT_COLUMNS.number}>{receipt.settlementNumber ?? receipt.advanceNumber}</Cell>
      <Cell width={RECEIPT_COLUMNS.employee}>{truncate(receipt.employee, 22)}</Cell>
      <Cell width={RECEIPT_COLUMNS.category}>{truncate(receipt.category, 17)}</Cell>
      <Cell width={RECEIPT_COLUMNS.description}>{truncate(description, 36)}</Cell>
      <Cell width={RECEIPT_COLUMNS.amount} right>
        {money(receipt.amount)}
      </Cell>
    </View>
  );
}

function Box({ label, value, note, danger }: { label: string; value: string; note?: string; danger?: boolean }) {
  return (
    <View style={styles.box} wrap={false}>
      <View style={styles.boxInner}>
        <Text style={styles.boxLabel}>{label}</Text>
        <Text style={[styles.boxValue, danger ? { color: COLORS.danger } : {}]}>{value}</Text>
        {note ? <Text style={styles.boxNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

function TableHead({ cells }: { cells: { label: string; flex: number; right?: boolean }[] }) {
  return (
    <View style={styles.tableHead}>
      {cells.map((cell) => (
        <Cell key={cell.label} flex={cell.flex} right={cell.right} head>
          {cell.label}
        </Cell>
      ))}
    </View>
  );
}

function Cell({
  children,
  flex,
  width,
  right,
  bold,
  head,
}: {
  children: ReactNode;
  flex?: number;
  width?: number;
  right?: boolean;
  bold?: boolean;
  head?: boolean;
}) {
  return (
    <View style={width ? { width, paddingRight: 4 } : { flex, paddingRight: 4 }}>
      <Text style={[head ? styles.th : {}, bold ? styles.bold : {}, right ? styles.right : {}]}>{children}</Text>
    </View>
  );
}

function Footer({ projectName }: { projectName: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>ArchiPay | Laporan project {truncate(projectName, 60)}</Text>
      <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
    </View>
  );
}

// "Rp 1.500.000" memakai spasi tanpa putus (NBSP) dari Intl; diganti spasi biasa.
function money(amount: number) {
  return formatRupiah(amount).replace(/ /g, " ");
}

function percent(value: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;
}

// "2026-10-24" → "24 Okt 2026". Tanggal kalender, tidak lewat zona waktu.
function shortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
