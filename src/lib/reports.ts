import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/calculations';

export type MonthlyPoint = {
  month: string; // "2026-01"
  label: string; // "Jan 2026"
  revenue: number;
  expenses: number;
  netProfit: number;
  depositTopUps: number;
  depositUsed: number;
  depositRefunds: number;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, 1)
  );
}

/** Builds the last `months` months of financial activity, oldest first. */
export async function getMonthlyFinancials(months = 12): Promise<MonthlyPoint[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [payments, expenses, depositTxns] = await Promise.all([
    prisma.payment.findMany({ where: { date: { gte: since } }, select: { date: true, amount: true } }),
    prisma.expense.findMany({ where: { date: { gte: since } }, select: { date: true, amount: true } }),
    prisma.depositTransaction.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, amount: true, type: true },
    }),
  ]);

  const buckets = new Map<string, MonthlyPoint>();
  for (let i = 0; i < months; i++) {
    const d = new Date(since);
    d.setMonth(d.getMonth() + i);
    const key = monthKey(d);
    buckets.set(key, {
      month: key,
      label: monthLabel(key),
      revenue: 0,
      expenses: 0,
      netProfit: 0,
      depositTopUps: 0,
      depositUsed: 0,
      depositRefunds: 0,
    });
  }

  for (const p of payments) {
    const key = monthKey(p.date);
    const bucket = buckets.get(key);
    if (bucket) bucket.revenue += toNumber(p.amount);
  }
  for (const e of expenses) {
    const key = monthKey(e.date);
    const bucket = buckets.get(key);
    if (bucket) bucket.expenses += toNumber(e.amount);
  }
  for (const t of depositTxns) {
    const key = monthKey(t.createdAt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = toNumber(t.amount);
    if (t.type === 'TOP_UP') bucket.depositTopUps += amount;
    else if (t.type === 'USED') bucket.depositUsed += amount;
    else if (t.type === 'REFUND') bucket.depositRefunds += amount;
  }

  const series = Array.from(buckets.values());
  for (const bucket of series) {
    bucket.revenue = Math.round(bucket.revenue * 100) / 100;
    bucket.expenses = Math.round(bucket.expenses * 100) / 100;
    bucket.netProfit = Math.round((bucket.revenue - bucket.expenses) * 100) / 100;
  }
  return series;
}

export type ReportSnapshot = {
  totalOutstanding: number;
  totalDepositsHeld: number;
  totalRevenueAllTime: number;
  totalExpensesAllTime: number;
  totalCogsAllTime: number;
  grossProfitAllTime: number;
};

export async function getReportSnapshot(): Promise<ReportSnapshot> {
  const [orders, allPayments, allExpenses, allDepositTxns, allOrders] = await Promise.all([
    prisma.order.findMany({ where: { status: { not: 'CANCELLED' } }, select: { outstandingBalance: true } }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.depositTransaction.findMany({ select: { amount: true, type: true } }),
    prisma.order.aggregate({ where: { status: { not: 'CANCELLED' } }, _sum: { totalCogs: true } }),
  ]);

  const totalOutstanding = orders.reduce((sum, o) => sum + toNumber(o.outstandingBalance), 0);

  let totalDepositsHeld = 0;
  for (const t of allDepositTxns) {
    const amount = toNumber(t.amount);
    if (t.type === 'TOP_UP') totalDepositsHeld += amount;
    else if (t.type === 'USED' || t.type === 'REFUND') totalDepositsHeld -= amount;
  }

  const totalRevenueAllTime = toNumber(allPayments._sum.amount ?? 0);
  const totalCogsAllTime = toNumber(allOrders._sum.totalCogs ?? 0);

  return {
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalDepositsHeld: Math.round(totalDepositsHeld * 100) / 100,
    totalRevenueAllTime,
    totalExpensesAllTime: toNumber(allExpenses._sum.amount ?? 0),
    totalCogsAllTime,
    grossProfitAllTime: Math.round((totalRevenueAllTime - totalCogsAllTime) * 100) / 100,
  };
}
