import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getCustomerDepositBalance } from '@/lib/deposit';
import { DepositTopUpForm } from '../deposit-topup-form';
import { RefundDepositForm } from '../refund-deposit-form';

const DEPOSIT_TYPE_LABELS: Record<string, string> = {
  TOP_UP: 'Top-up',
  USED: 'Used on order',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
};

export default async function CustomerProfilePage({ params }: { params: { id: string } }) {
  const customer = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!customer) notFound();

  const [orders, depositTxns, depositBalance] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: params.id },
      orderBy: { orderDate: 'desc' },
    }),
    prisma.depositTransaction.findMany({
      where: { customerId: params.id },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { orderNumber: true } } },
    }),
    getCustomerDepositBalance(params.id),
  ]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </Link>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/customers/${customer.id}/edit`}>
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-primary">{customer.name}</h1>
        <p className="text-sm text-muted-foreground">{customer.phone}</p>
        {customer.address && <p className="text-sm text-muted-foreground">{customer.address}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {orders.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="flex flex-col gap-2 p-4 hover:bg-secondary/50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium">{o.orderNumber}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(o.orderDate)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <PaymentStatusBadge status={o.paymentStatus} />
                          <OrderStatusBadge status={o.status} />
                          <span className="font-medium">{formatCurrency(o.totalAmount.toString())}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deposit history</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {depositTxns.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No deposit transactions yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Notes</th>
                      <th className="px-4 py-2 font-medium text-right">Amount</th>
                      <th className="px-4 py-2 font-medium text-right">Balance after</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {depositTxns.map((t) => {
                      const isCredit = t.type === 'TOP_UP';
                      return (
                        <tr key={t.id}>
                          <td className="px-4 py-2 text-muted-foreground">{formatDate(t.createdAt)}</td>
                          <td className="px-4 py-2">{DEPOSIT_TYPE_LABELS[t.type] ?? t.type}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {t.order ? `Order ${t.order.orderNumber}` : t.notes || '—'}
                          </td>
                          <td
                            className={`px-4 py-2 text-right font-medium ${isCredit ? 'text-success' : 'text-destructive'}`}
                          >
                            {isCredit ? '+' : '-'}
                            {formatCurrency(t.amount.toString())}
                          </td>
                          <td className="px-4 py-2 text-right">{formatCurrency(t.balanceAfter.toString())}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Deposit balance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-3xl font-semibold text-primary">{formatCurrency(depositBalance)}</p>
              <div className="flex flex-wrap gap-2">
                <DepositTopUpForm customerId={customer.id} />
                <RefundDepositForm customerId={customer.id} depositBalance={depositBalance} />
              </div>
            </CardContent>
          </Card>

          {customer.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{customer.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
