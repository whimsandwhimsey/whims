import { Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getMonthlyFinancials, getReportSnapshot } from '@/lib/reports';
import { RevenueExpenseChart, DepositActivityChart } from '@/components/reports-charts';
import { formatCurrency } from '@/lib/utils';

export default async function ReportsPage() {
  const [monthly, snapshot] = await Promise.all([getMonthlyFinancials(12), getReportSnapshot()]);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">Financial reports</h1>
          <p className="text-sm text-muted-foreground">Last 12 months</p>
        </div>
        <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
          <a href="/api/export/reports" download>
            <Download className="h-4 w-4" /> Export to Excel
          </a>
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Outstanding receivables</p>
            <p className="text-xl font-semibold text-destructive">{formatCurrency(snapshot.totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Deposits currently held</p>
            <p className="text-xl font-semibold">{formatCurrency(snapshot.totalDepositsHeld)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Revenue (all time)</p>
            <p className="text-xl font-semibold text-success">{formatCurrency(snapshot.totalRevenueAllTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Expenses (all time)</p>
            <p className="text-xl font-semibold text-destructive">{formatCurrency(snapshot.totalExpensesAllTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">COGS (all time)</p>
            <p className="text-xl font-semibold text-destructive">{formatCurrency(snapshot.totalCogsAllTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Gross profit (revenue − COGS)</p>
            <p
              className={`text-xl font-semibold ${snapshot.grossProfitAllTime >= 0 ? 'text-success' : 'text-destructive'}`}
            >
              {formatCurrency(snapshot.grossProfitAllTime)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue, expenses &amp; net profit</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueExpenseChart data={monthly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deposit activity</CardTitle>
          </CardHeader>
          <CardContent>
            <DepositActivityChart data={monthly} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Monthly breakdown</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 font-medium text-right">Revenue</th>
                  <th className="px-4 py-2 font-medium text-right">Expenses</th>
                  <th className="px-4 py-2 font-medium text-right">Net profit</th>
                  <th className="px-4 py-2 font-medium text-right">Deposit top-ups</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td className="px-4 py-2">{m.label}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.revenue)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.expenses)}</td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${m.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}
                    >
                      {formatCurrency(m.netProfit)}
                    </td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.depositTopUps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
