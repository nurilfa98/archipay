// Dokumen PDF laporan satu project (@react-pdf/renderer), A4 potret.
//
// Isi, dari yang paling penting bagi Owner untuk evaluasi:
// 1. Nilai kontrak, pengeluaran, keuntungan, dan pemakaian nilai kontrak.
// 2. Uang muka dicairkan, dana beredar, jumlah nota, dan nota tanpa bukti.
// 3. Pengeluaran per kategori, per bulan, per karyawan, serta nota terbesar.
// 4. Daftar seluruh nota yang disetujui. Foto nota tidak disertakan.
//
// Aturan khusus PDF:
// - Font bawaan Helvetica hanya memuat karakter Latin standar. Hindari tanda
//   seperti "≥", "−", atau emoji; pakai teks biasa.
// - Daftar nota dipecah per halaman dengan baris berukuran tetap, supaya judul
//   kolom bisa diulang di setiap halaman (react-pdf belum punya header tabel
//   yang berulang). Daftar mulai di halaman pertama bila masih ada tempat
//   (tinggi bagian ringkasan diperkirakan, lihat freeSpaceAfterSummary), lalu
//   dilanjutkan di halaman berikutnya.
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
  zebra: "#f8fafc",
  accent: "#4f46e5",
  accentSoft: "#eef2ff",
  success: "#047857",
  successSoft: "#ecfdf5",
  warning: "#b45309",
  warningSoft: "#fffbeb",
  danger: "#be123c",
  dangerSoft: "#fff1f2",
};

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 54, paddingHorizontal: 36, fontSize: 9, fontFamily: "Helvetica", color: COLORS.ink },
  eyebrow: { fontSize: 8, color: COLORS.accent, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 4 },
  subtitle: { fontSize: 9.5, color: COLORS.muted, marginTop: 3 },
  meta: { fontSize: 8, color: COLORS.muted, marginTop: 6 },
  header: { borderBottomWidth: 1.5, borderBottomColor: COLORS.accent, paddingBottom: 10, marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  pill: { borderRadius: 8, paddingVertical: 2.5, paddingHorizontal: 8, fontSize: 8, fontFamily: "Helvetica-Bold" },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  hero: { flexDirection: "row", marginHorizontal: -4 },
  heroBox: { flex: 1, paddingHorizontal: 4 },
  heroInner: { borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 2.5 },
  heroLabel: { fontSize: 8, color: COLORS.muted },
  heroValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },
  boxNote: { fontSize: 7.5, color: COLORS.muted, marginTop: 2 },
  stats: { flexDirection: "row", marginHorizontal: -4, marginTop: 8 },
  statBox: { flex: 1, paddingHorizontal: 4 },
  statInner: { backgroundColor: COLORS.soft, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 },
  statValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: COLORS.line },
  barFill: { height: 6, borderRadius: 3 },
  tableHead: { flexDirection: "row", backgroundColor: COLORS.soft, borderRadius: 2, paddingVertical: 4, paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: COLORS.line, paddingVertical: 4, paddingHorizontal: 4, minHeight: 18 },
  rowAlt: { backgroundColor: COLORS.zebra },
  rowTotal: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4 },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: COLORS.muted },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  empty: { fontSize: 9, color: COLORS.muted, paddingVertical: 8 },
  note: { fontSize: 7.5, color: COLORS.muted, marginTop: 4 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: COLORS.muted },
});

// ---------------------------------------------------------------------------
// Ukuran halaman (pt). Dipakai untuk memperkirakan sisa tempat di halaman
// pertama bagi daftar nota. Semua baris satu baris teks (teks dipotong), jadi
// tingginya tetap.
// ---------------------------------------------------------------------------

const PAGE_USABLE = 842 - 36 - 54;
const SUMMARY_ROW = 18.5; // baris tabel ringkasan (minHeight 18 + garis 0,5)
const NOTA_ROW = 19; // baris daftar nota (tinggi tetap)
const TABLE_HEAD = 17;
const SECTION_HEAD = 33; // jarak atas bagian + judul
const TOTAL_ROW = 18;
// Cadangan agar perkiraan yang meleset sedikit tidak membuat satu baris
// "tumpah" ke halaman berikutnya tanpa judul kolom.
const SAFETY = 16;
// Baris nota di halaman lanjutan (tanpa bagian ringkasan).
const ROWS_PER_PAGE = 32;
// Judul bagian tidak boleh ditinggal sendirian di dasar halaman: bila sisa tempat
// kurang dari ini, bagian pindah ke halaman berikutnya (minPresenceAhead).
const MIN_PRESENCE = 70;
// "Nota terbesar" hanya berguna bila notanya banyak; di bawah ini cukup daftar lengkap.
const TOP_RECEIPTS_MIN_COUNT = 20;
// Daftar nota pindah ke halaman baru bila di halaman pertama muat kurang dari ini.
const MIN_ROWS_ON_FIRST_PAGE = 4;

function showTopReceipts(report: ProjectReport) {
  return report.topReceipts.length > 0 && report.receipts.length > TOP_RECEIPTS_MIN_COUNT;
}

function sectionHeights(report: ProjectReport) {
  const { categories, months, employees, topReceipts } = report;
  return {
    categories: SECTION_HEAD + (categories.length === 0 ? 24 : TABLE_HEAD + categories.length * SUMMARY_ROW + TOTAL_ROW),
    months: months.length >= 2 ? SECTION_HEAD + TABLE_HEAD + months.length * SUMMARY_ROW : 0,
    employees: SECTION_HEAD + (employees.length === 0 ? 24 : TABLE_HEAD + employees.length * SUMMARY_ROW + 16),
    top: showTopReceipts(report) ? SECTION_HEAD + TABLE_HEAD + topReceipts.length * NOTA_ROW : 0,
  };
}

// Sisa tempat di halaman terakhir bagian ringkasan: bagian disusun berurutan,
// yang tidak muat dipindah utuh ke halaman berikutnya.
function freeSpaceAfterSummary(report: ProjectReport) {
  const heights = sectionHeights(report);
  // split: tabel boleh terbelah antar baris; "nota terbesar" dan kotak di atas selalu utuh.
  const blocks = [
    { height: 86, split: false }, // header
    { height: 55, split: false }, // tiga kotak utama
    { height: report.summary.contractValue === null ? 20 : 47, split: false }, // pemakaian nilai kontrak
    { height: 40, split: false }, // empat kotak ringkas
    { height: heights.categories, split: true },
    { height: heights.months, split: true },
    { height: heights.employees, split: true },
    { height: heights.top, split: false },
  ].filter((block) => block.height > 0);

  let free = PAGE_USABLE;
  for (const { height, split } of blocks) {
    if (height <= free) free -= height;
    else if (split && free >= MIN_PRESENCE) free = PAGE_USABLE - ((height - free) % PAGE_USABLE);
    else free = PAGE_USABLE - (height % PAGE_USABLE);
  }
  return free;
}

// Berapa baris nota yang masih muat di halaman terakhir bagian ringkasan.
function rowsOnFirstPage(report: ProjectReport) {
  const free = freeSpaceAfterSummary(report) - SECTION_HEAD - TABLE_HEAD - TOTAL_ROW - SAFETY;
  const rows = Math.floor(free / NOTA_ROW);
  return rows >= MIN_ROWS_ON_FIRST_PAGE ? rows : 0;
}

// Lebar kolom daftar nota (total 523pt = lebar A4 dikurangi margin).
const RECEIPT_COLUMNS = { date: 50, number: 102, employee: 88, category: 72, description: 121, amount: 90 };

export function ProjectReportDocument({
  report,
  generatedAt,
  generatedBy,
}: {
  report: ProjectReport;
  generatedAt: string;
  generatedBy: string;
}) {
  const { project, summary, receipts } = report;
  const firstCount = Math.min(receipts.length, rowsOnFirstPage(report));
  const firstRows = receipts.slice(0, firstCount);
  const restPages = chunk(receipts.slice(firstCount), ROWS_PER_PAGE);

  return (
    <Document title={`Laporan Proyek ${project.name}`} author="ArchiPay" creator="ArchiPay">
      <Page size="A4" style={styles.page}>
        <Summary report={report} generatedAt={generatedAt} generatedBy={generatedBy} />

        {firstRows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={MIN_PRESENCE}>Daftar nota disetujui</Text>
            <ReceiptHead />
            {firstRows.map((receipt, index) => (
              <ReceiptRow key={index} receipt={receipt} alt={index % 2 === 1} />
            ))}
            {restPages.length === 0 && <ReceiptTotal count={receipts.length} amount={summary.expense} />}
          </View>
        )}
        <Footer projectName={project.name} />
      </Page>

      {restPages.map((rows, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          <Text style={styles.sectionTitle} minPresenceAhead={MIN_PRESENCE}>
            Daftar nota disetujui{firstRows.length > 0 || pageIndex > 0 ? " (lanjutan)" : ""}
          </Text>
          <ReceiptHead />
          {rows.map((receipt, index) => (
            <ReceiptRow key={index} receipt={receipt} alt={index % 2 === 1} />
          ))}
          {pageIndex === restPages.length - 1 && <ReceiptTotal count={receipts.length} amount={summary.expense} />}
          <Footer projectName={project.name} />
        </Page>
      ))}
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Bagian ringkasan
// ---------------------------------------------------------------------------

function Summary({
  report,
  generatedAt,
  generatedBy,
}: {
  report: ProjectReport;
  generatedAt: string;
  generatedBy: string;
}) {
  const { project, summary, categories, months, employees, topReceipts, noProof, period } = report;
  const provisional = project.status === "ACTIVE";
  const profitNegative = summary.profit !== null && summary.profit < 0;
  const used = summary.usedPercent;
  const usedColor = used === null ? COLORS.accent : used > 100 ? COLORS.danger : used >= 80 ? COLORS.warning : COLORS.accent;
  const maxCategory = Math.max(1, ...categories.map((category) => category.amount));
  const maxMonth = Math.max(1, ...months.map((month) => month.amount));
  const average = summary.receiptCount > 0 ? Math.round(summary.expense / summary.receiptCount) : 0;

  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.eyebrow}>LAPORAN PROYEK</Text>
            <Text style={styles.title}>{truncate(project.name, 48)}</Text>
          </View>
          <Text
            style={[
              styles.pill,
              provisional
                ? { backgroundColor: COLORS.accentSoft, color: COLORS.accent }
                : { backgroundColor: COLORS.successSoft, color: COLORS.success },
            ]}
          >
            {provisional ? "Aktif" : "Selesai"}
          </Text>
        </View>
        <Text style={styles.subtitle}>
          {project.client ? `Klien: ${project.client}` : "Tanpa nama klien"}
          {period ? `  |  Nota tanggal ${shortDate(period.from)} - ${shortDate(period.to)}` : ""}
        </Text>
        <Text style={styles.meta}>
          Dicetak {generatedAt} oleh {generatedBy}
        </Text>
      </View>

      <View style={styles.hero}>
        <HeroBox
          label="Nilai kontrak"
          value={summary.contractValue === null ? "Belum diisi" : money(summary.contractValue)}
          color={COLORS.ink}
          tint={COLORS.soft}
        />
        <HeroBox
          label="Pengeluaran disetujui"
          value={money(summary.expense)}
          note={used !== null ? `${percent(used)} dari nilai kontrak` : "Nota yang sudah diverifikasi"}
          color={COLORS.accent}
          tint={COLORS.accentSoft}
        />
        <HeroBox
          label={provisional ? "Keuntungan (sementara)" : "Keuntungan (final)"}
          value={summary.profit === null ? "-" : money(summary.profit)}
          note={summary.marginPercent !== null ? `Margin ${percent(summary.marginPercent)}` : undefined}
          color={profitNegative ? COLORS.danger : COLORS.success}
          tint={profitNegative ? COLORS.dangerSoft : COLORS.successSoft}
          valueColor={profitNegative ? COLORS.danger : undefined}
        />
      </View>

      {used !== null ? (
        <View style={{ marginTop: 10 }} wrap={false}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>Pemakaian nilai kontrak</Text>
            <Text style={{ fontSize: 8.5, color: usedColor, fontFamily: "Helvetica-Bold" }}>
              {percent(used)}
              {used > 100 ? " (melebihi kontrak)" : ""}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(100, used)}%`, backgroundColor: usedColor }]} />
          </View>
          <Text style={styles.note}>
            Sisa nilai kontrak {money(summary.contractValue! - summary.expense)} dari {money(summary.contractValue!)}.
          </Text>
        </View>
      ) : (
        <Text style={[styles.note, { marginTop: 8 }]}>
          Nilai kontrak belum diisi, jadi keuntungan dan pemakaian kontrak belum bisa dihitung.
        </Text>
      )}

      <View style={styles.stats} wrap={false}>
        <StatBox
          label="Uang muka dicairkan"
          value={`${summary.advanceCount} uang muka`}
          note={`Total ${money(summary.disbursedTotal)}`}
        />
        <StatBox label="Dana beredar" value={money(summary.outstanding)} note="Nota belum diverifikasi" />
        <StatBox
          label="Nota disetujui"
          value={`${summary.receiptCount} nota`}
          note={summary.receiptCount > 0 ? `Rata-rata ${money(average)}` : undefined}
        />
        <StatBox
          label="Nota tanpa bukti"
          value={`${noProof.count} nota`}
          note={noProof.count > 0 ? money(noProof.amount) : "Semua nota ada bukti"}
          warning={noProof.count > 0}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} minPresenceAhead={MIN_PRESENCE}>Pengeluaran per kategori</Text>
        {categories.length === 0 ? (
          <Text style={styles.empty}>Belum ada nota yang disetujui.</Text>
        ) : (
          <>
            <TableHead
              cells={[
                { label: "Kategori", flex: 3 },
                { label: "", flex: 3 },
                { label: "Nota", flex: 0.9, right: true },
                { label: "Total", flex: 2.2, right: true },
                { label: "Porsi", flex: 1.1, right: true },
              ]}
            />
            {categories.map((category, index) => (
              <View key={category.name} style={[styles.row, index % 2 === 1 ? styles.rowAlt : {}]} wrap={false}>
                <Cell flex={3}>{truncate(category.name, 28)}</Cell>
                <BarCell flex={3} ratio={category.amount / maxCategory} color={COLORS.accent} />
                <Cell flex={0.9} right>
                  {String(category.count)}
                </Cell>
                <Cell flex={2.2} right>
                  {money(category.amount)}
                </Cell>
                <Cell flex={1.1} right>
                  {percent((category.amount / summary.expense) * 100)}
                </Cell>
              </View>
            ))}
            <View style={styles.rowTotal} wrap={false}>
              <Cell flex={6.9} bold>
                Total
              </Cell>
              <Cell flex={2.2} right bold>
                {money(summary.expense)}
              </Cell>
              <Cell flex={1.1} right>
                {""}
              </Cell>
            </View>
          </>
        )}
      </View>

      {months.length >= 2 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} minPresenceAhead={MIN_PRESENCE}>Pengeluaran per bulan</Text>
          <TableHead
            cells={[
              { label: "Bulan", flex: 3 },
              { label: "", flex: 3 },
              { label: "Nota", flex: 0.9, right: true },
              { label: "Total", flex: 3.3, right: true },
            ]}
          />
          {months.map((month, index) => (
            <View key={month.key} style={[styles.row, index % 2 === 1 ? styles.rowAlt : {}]} wrap={false}>
              <Cell flex={3}>{month.label}</Cell>
              <BarCell flex={3} ratio={month.amount / maxMonth} color={COLORS.success} />
              <Cell flex={0.9} right>
                {String(month.count)}
              </Cell>
              <Cell flex={3.3} right>
                {money(month.amount)}
              </Cell>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} minPresenceAhead={MIN_PRESENCE}>Per karyawan</Text>
        {employees.length === 0 ? (
          <Text style={styles.empty}>Belum ada uang muka yang dicairkan.</Text>
        ) : (
          <>
            <TableHead
              cells={[
                { label: "Karyawan", flex: 3.6 },
                { label: "Uang muka", flex: 1.4, right: true },
                { label: "Dicairkan", flex: 2.4, right: true },
                { label: "Pengeluaran", flex: 2.4, right: true },
                { label: "Sisa dana", flex: 2.4, right: true },
              ]}
            />
            {employees.map((employee, index) => {
              const left = employee.disbursed - employee.expense;
              return (
                <View key={employee.name} style={[styles.row, index % 2 === 1 ? styles.rowAlt : {}]} wrap={false}>
                  <Cell flex={3.6}>{truncate(employee.name, 30)}</Cell>
                  <Cell flex={1.4} right>
                    {String(employee.advances)}
                  </Cell>
                  <Cell flex={2.4} right>
                    {money(employee.disbursed)}
                  </Cell>
                  <Cell flex={2.4} right>
                    {money(employee.expense)}
                  </Cell>
                  <Cell flex={2.4} right color={left < 0 ? COLORS.danger : undefined}>
                    {money(left)}
                  </Cell>
                </View>
              );
            })}
            <Text style={styles.note}>
              Sisa dana = dicairkan dikurangi pengeluaran disetujui. Belum final untuk uang muka yang masih berjalan.
            </Text>
          </>
        )}
      </View>

      {showTopReceipts(report) && (
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle} minPresenceAhead={MIN_PRESENCE}>{topReceipts.length} nota terbesar</Text>
          <ReceiptHead />
          {topReceipts.map((receipt, index) => (
            <ReceiptRow key={index} receipt={receipt} alt={index % 2 === 1} />
          ))}
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Daftar nota
// ---------------------------------------------------------------------------

function ReceiptHead() {
  return (
    <View style={styles.tableHead}>
      <Cell width={RECEIPT_COLUMNS.date} head>
        Tanggal
      </Cell>
      <Cell width={RECEIPT_COLUMNS.number} head>
        No. Pertanggungjawaban
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

function ReceiptRow({ receipt, alt }: { receipt: ReportReceipt; alt: boolean }) {
  const description = receipt.hasReceipt ? receipt.description : `${receipt.description} (tanpa nota)`;
  return (
    <View style={[styles.row, alt ? styles.rowAlt : {}, { fontSize: 8, height: NOTA_ROW }]} wrap={false}>
      <Cell width={RECEIPT_COLUMNS.date}>{shortDate(receipt.date)}</Cell>
      <Cell width={RECEIPT_COLUMNS.number}>{receipt.settlementNumber ?? receipt.advanceNumber}</Cell>
      <Cell width={RECEIPT_COLUMNS.employee}>{truncate(receipt.employee, 22)}</Cell>
      <Cell width={RECEIPT_COLUMNS.category}>{truncate(receipt.category, 17)}</Cell>
      <Cell width={RECEIPT_COLUMNS.description}>{truncate(description, 29)}</Cell>
      <Cell width={RECEIPT_COLUMNS.amount} right>
        {money(receipt.amount)}
      </Cell>
    </View>
  );
}

function ReceiptTotal({ count, amount }: { count: number; amount: number }) {
  return (
    <View style={styles.rowTotal} wrap={false}>
      <Cell flex={1} bold>
        Total {count} nota
      </Cell>
      <Cell width={RECEIPT_COLUMNS.amount} right bold>
        {money(amount)}
      </Cell>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Komponen kecil
// ---------------------------------------------------------------------------

function HeroBox({
  label,
  value,
  note,
  color,
  tint,
  valueColor,
}: {
  label: string;
  value: string;
  note?: string;
  color: string;
  tint: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.heroBox} wrap={false}>
      <View style={[styles.heroInner, { backgroundColor: tint, borderTopColor: color }]}>
        <Text style={styles.heroLabel}>{label}</Text>
        <Text style={[styles.heroValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
        <Text style={styles.boxNote}>{note ?? " "}</Text>
      </View>
    </View>
  );
}

function StatBox({ label, value, note, warning }: { label: string; value: string; note?: string; warning?: boolean }) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statInner, warning ? { backgroundColor: COLORS.warningSoft } : {}]}>
        <Text style={styles.heroLabel}>{label}</Text>
        <Text style={[styles.statValue, warning ? { color: COLORS.warning } : {}]}>{value}</Text>
        <Text style={styles.boxNote}>{note ?? " "}</Text>
      </View>
    </View>
  );
}

function BarCell({ flex, ratio, color }: { flex: number; ratio: number; color: string }) {
  return (
    <View style={{ flex, paddingRight: 8 }}>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(2, Math.min(100, ratio * 100))}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function TableHead({ cells }: { cells: { label: string; flex: number; right?: boolean }[] }) {
  return (
    <View style={styles.tableHead}>
      {cells.map((cell, index) => (
        <Cell key={index} flex={cell.flex} right={cell.right} head>
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
  color,
}: {
  children: ReactNode;
  flex?: number;
  width?: number;
  right?: boolean;
  bold?: boolean;
  head?: boolean;
  color?: string;
}) {
  return (
    <View style={width ? { width, paddingRight: 4 } : { flex, paddingRight: 4 }}>
      <Text style={[head ? styles.th : {}, bold ? styles.bold : {}, right ? styles.right : {}, color ? { color } : {}]}>
        {children}
      </Text>
    </View>
  );
}

function Footer({ projectName }: { projectName: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>ArchiPay | Laporan proyek {truncate(projectName, 60)}</Text>
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
