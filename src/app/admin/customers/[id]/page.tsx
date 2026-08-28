import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';
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

  const [orders, depositTxns, payments, depositBalance] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: params.id },
      orderBy: { orderDate: 'desc' },
    }),
    prisma.depositTransaction.findMany({
      where: { customerId: params.id },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { orderNumber: true } }, invoice: { select: { invoiceNumber: true } } },
    }),
    prisma.payment.findMany({
      where: { customerId: params.id },
      orderBy: { date: 'desc' },
      include: { invoice: { select: { invoiceNumber: true } }, order: { select: { orderNumber: true } } },
    }),
    getCustomerDepositBalance(params.id),
  ]);

  // One unified, chronological money timeline — every Payment (real cash)
  // and every DepositTransaction (top-up/used/refund/adjustment) — instead
  // of showing deposit activity in isolation. Deposit-USED entries are
  // clearly labeled as reducing the deposit balance, not a fresh payment.
  type HistoryRow = {
    id: string;
    date: Date;
    kind: 'payment' | 'deposit';
    label: string;
    detail: string;
    amount: number;
    isCredit: boolean;
  };

  const paymentRows: HistoryRow[] = payments.map((p) => ({
    id: `pay-${p.id}`,
    date: p.date,
    kind: 'payment',
    label: p.method === 'BANK_TRANSFER' ? 'Bank Transfer' : 'QRIS',
    detail: p.invoice ? `Invoice ${p.invoice.invoiceNumber}` : p.order ? `Order ${p.order.orderNumber}` : p.notes || 'Deposit top-up',
    amount: toNumber(p.amount),
    isCredit: true,
  }));

  const depositRows: HistoryRow[] = depositTxns.map((t) => ({
    id: `dep-${t.id}`,
    date: t.createdAt,
    kind: 'deposit',
    label: DEPOSIT_TYPE_LABELS[t.type] ?? t.type,
    detail:
      t.type === 'USED'
        ? `Mengurangi deposit — dipakai untuk ${t.invoice ? `invoice ${t.invoice.invoiceNumber}` : t.order ? `order ${t.order.orderNumber}` : 'pembayaran'}`
        : t.invoice
          ? `Invoice ${t.invoice.invoiceNumber}`
          : t.order
            ? `Order ${t.order.orderNumber}`
            : t.notes || '—',
    amount: toNumber(t.amount),
    isCredit: t.type === 'TOP_UP',
  }));

  const history = [...paymentRows, ...depositRows].sort((a, b) => b.date.getTime() - a.date.getTime());

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
              <CardTitle>Riwayat transaksi</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Belum ada transaksi.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Tanggal</th>
                      <th className="px-4 py-2 font-medium">Tipe</th>
                      <th className="px-4 py-2 font-medium">Keterangan</th>
                      <th className="px-4 py-2 font-medium text-right">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2 text-muted-foreground">{formatDate(row.date)}</td>
                        <td className="px-4 py-2">{row.label}</td>
                        <td className="px-4 py-2 text-muted-foreground">{row.detail}</td>
                        <td
                          className={`px-4 py-2 text-right font-medium ${row.isCredit ? 'text-success' : 'text-destructive'}`}
                        >
                          {row.isCredit ? '+' : '-'}
                          {formatCurrency(row.amount)}
                        </td>
                      </tr>
                    ))}
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
