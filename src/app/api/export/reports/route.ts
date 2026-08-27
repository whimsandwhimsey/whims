import { getMonthlyFinancials, getReportSnapshot } from '@/lib/reports';
import { getAuthSession } from '@/lib/session';
import { excelDownloadResponse, styleHeaderRow } from '@/lib/excel';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const [monthly, snapshot] = await Promise.all([getMonthlyFinancials(12), getReportSnapshot()]);

  return excelDownloadResponse('financial-report.xlsx', (workbook) => {
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 32 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    summarySheet.addRow({ metric: 'Outstanding receivables', value: snapshot.totalOutstanding });
    summarySheet.addRow({ metric: 'Deposits currently held', value: snapshot.totalDepositsHeld });
    summarySheet.addRow({ metric: 'Revenue (all time)', value: snapshot.totalRevenueAllTime });
    summarySheet.addRow({ metric: 'Expenses (all time)', value: snapshot.totalExpensesAllTime });
    summarySheet.addRow({ metric: 'COGS (all time)', value: snapshot.totalCogsAllTime });
    summarySheet.addRow({ metric: 'Gross profit (revenue − COGS)', value: snapshot.grossProfitAllTime });
    styleHeaderRow(summarySheet);

    const monthlySheet = workbook.addWorksheet('Monthly Breakdown');
    monthlySheet.columns = [
      { header: 'Month', key: 'label', width: 14 },
      { header: 'Revenue', key: 'revenue', width: 16 },
      { header: 'Expenses', key: 'expenses', width: 16 },
      { header: 'Net Profit', key: 'netProfit', width: 16 },
      { header: 'Deposit Top-ups', key: 'depositTopUps', width: 18 },
      { header: 'Deposit Used', key: 'depositUsed', width: 16 },
      { header: 'Deposit Refunds', key: 'depositRefunds', width: 16 },
    ];
    for (const m of monthly) {
      monthlySheet.addRow(m);
    }
    styleHeaderRow(monthlySheet);
  });
}
