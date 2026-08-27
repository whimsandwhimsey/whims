import Link from 'next/link';
import { Users, Package, Clock, Wallet, TrendingUp, TrendingDown, UserPlus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';

export default async function AdminDashboardPage() {
  const [
    totalCustomers,
    pendingSignups,
    pendingRequests,
    activeOrders,
    waitingOrders,
    orders,
    expenses,
    recentActivity,
  ] = await Promise.all([
    prisma.customer.count({ where: { status: 'ACTIVE' } }),
    prisma.customer.count({ where: { status: 'PENDING' } }),
    Promise.all([
      prisma.topUpRequest.count({ where: { status: 'PENDING' } }),
      prisma.addressChangeRequest.count({ where: { status: 'PENDING' } }),
    ]).then(([a, b]) => a + b),
    prisma.order.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.order.count({ where: { status: 'WAITING' } }),
    prisma.order.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { outstandingBalance: true, amountPaid: true },
    }),
    prisma.expense.findMany({ select: { amount: true } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const outstandingTotal = orders.reduce((sum, o) => sum + toNumber(o.outstandingBalance), 0);
  const revenueCollected = orders.reduce((sum, o) => sum + toNumber(o.amountPaid), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
  const netProfit = revenueCollected - totalExpenses;

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-1 font-display text-2xl font-semibold text-primary">Dashboard</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Overview of customers, orders, and outstanding balances.
      </p>

      {pendingRequests > 0 && (
        <Link
          href="/admin/requests"
          className="mb-4 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span>
            <strong>{pendingRequests}</strong> customer request{pendingRequests === 1 ? '' : 's'} (top-up /
            address change) waiting for confirmation
          </span>
          <span className="font-medium underline underline-offset-2">Review →</span>
        </Link>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={Users}
          label="Total customers"
          value={totalCustomers.toLocaleString()}
          href="/admin/customers"
        />
        <MetricCard
          icon={UserPlus}
          label="Pending signups"
          value={pendingSignups.toLocaleString()}
          href="/admin/customers?status=PENDING"
        />
        <MetricCard
          icon={Package}
          label="Active orders"
          value={activeOrders.toLocaleString()}
          href="/admin/orders"
        />
        <MetricCard
          icon={Clock}
          label="Books waiting to arrive"
          value={waitingOrders.toLocaleString()}
          href="/admin/orders?status=WAITING"
        />
        <MetricCard
          icon={Wallet}
          label="Outstanding balance"
          value={formatCurrency(outstandingTotal)}
          href="/admin/orders"
        />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Revenue collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-success">{formatCurrency(revenueCollected)}</p>
          </CardContent>
        </Card>

        <Link href="/admin/expenses">
          <Card className="transition-colors hover:border-primary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="h-4 w-4" /> Total expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-destructive">{formatCurrency(totalExpenses)}</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Net profit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(netProfit)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Revenue collected minus expenses</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {recentActivity.map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-4">
                  <span>{log.summary ?? `${log.action} ${log.entityType}`}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="flex items-center gap-4 pt-6">
          <div className="rounded-md bg-secondary p-2.5">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
