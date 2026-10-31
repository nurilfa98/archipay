// Beranda khusus Owner: pengeluaran & keuntungan per project, hal yang perlu
// perhatian, dan grafik pengeluaran. Server Component.
//
// Pemanggil WAJIB sudah memeriksa project:manage (OWNER): halaman ini memuat
// nilai kontrak dan keuntungan.

import { getOwnerDashboard } from "../finance-queries";
import { summarizeFinance } from "../finance-summary";
import { AttentionList } from "./attention-list";
import { ExpenseCharts } from "./expense-charts";
import { FinanceKpis } from "./finance-kpis";
import { ProjectFinanceList } from "./project-finance-list";

export async function OwnerDashboard({ companyId }: { companyId: string }) {
  const { projects, categories, months } = await getOwnerDashboard(companyId);

  return (
    <>
      <FinanceKpis totals={summarizeFinance(projects)} />
      <AttentionList projects={projects} />
      <section className="flex flex-col gap-2" aria-labelledby="project-finance-title">
        <h2 id="project-finance-title" className="text-sm font-medium">
          Keuangan per project
        </h2>
        <ProjectFinanceList projects={projects} />
        <p className="text-xs text-muted-foreground">
          Keuntungan = nilai kontrak − nota yang disetujui. Project aktif ditandai &quot;sementara&quot; karena
          pengeluarannya masih bisa bertambah.
        </p>
      </section>
      <ExpenseCharts categories={categories} months={months} />
    </>
  );
}
