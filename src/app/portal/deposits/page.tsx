import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { getCustomerDepositBalance } from '@/lib/deposit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';

const DEPOSIT_TYPE_LABELS: Record<string, string> = {
  TOP_UP: 'Top-up',
  USED: 'Used on order',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
};

export default async function PortalDepositsPage() {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const [depositBalance, transactions] = await Promise.all([
    getCustomerDepositBalance(customerId),
    prisma.depositTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { orderNumber: true } } },
    }),
  ]);

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/portal/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to your orders
        </Link>

        <h1 className="mb-1 font-display text-2xl font-semibold text-primary">Deposit balance</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Every top-up, refund, and use of your deposit is recorded here — fully transparent, in order.
        </p>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Current balance</p>
            <p className="text-3xl font-semibold text-success">{formatCurrency(depositBalance)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transaction history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No deposit transactions yet. If you ever pay more than an order&apos;s balance, the
                extra automatically becomes deposit here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {transactions.map((t) => {
                  const isCredit = t.type === 'TOP_UP';
                  return (
                    <li key={t.id} className="flex items-center justify-between p-4 text-sm">
                      <div>
                        <p className="font-medium">{DEPOSIT_TYPE_LABELS[t.type] ?? t.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(t.createdAt)}
                          {t.order ? ` · Order ${t.order.orderNumber}` : ''}
                          {t.notes ? ` · ${t.notes}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={isCredit ? 'font-medium text-success' : 'font-medium text-destructive'}>
                          {isCredit ? '+' : '-'}
                          {formatCurrency(t.amount.toString())}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Balance: {formatCurrency(t.balanceAfter.toString())}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
