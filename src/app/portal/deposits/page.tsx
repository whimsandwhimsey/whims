import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { getCustomerDepositBalance } from '@/lib/deposit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';

const DEPOSIT_TYPE_LABELS: Record<string, string> = {
  TOP_UP: 'Top-up deposit',
  USED: 'Deposit dipakai',
  REFUND: 'Refund',
  ADJUSTMENT: 'Penyesuaian',
};

export default async function PortalDepositsPage() {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const [depositBalance, depositTxns, payments] = await Promise.all([
    getCustomerDepositBalance(customerId),
    prisma.depositTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { orderNumber: true } }, invoice: { select: { invoiceNumber: true } } },
    }),
    prisma.payment.findMany({
      where: { customerId },
      orderBy: { date: 'desc' },
      include: { invoice: { select: { invoiceNumber: true } }, order: { select: { orderNumber: true } } },
    }),
  ]);

  // One unified, chronological history — every real Payment (QRIS/transfer)
  // and every deposit-ledger event, not just top-ups. Matches the "riwayat
  // transaksi" view on the admin side, from the customer's own vantage.
  type HistoryRow = { id: string; date: Date; label: string; detail: string; amount: number; isCredit: boolean };

  const paymentRows: HistoryRow[] = payments.map((p) => ({
    id: `pay-${p.id}`,
    date: p.date,
    label: p.method === 'BANK_TRANSFER' ? 'Bank Transfer' : 'QRIS',
    detail: p.invoice
      ? `Pembayaran untuk ${p.invoice.invoiceNumber}`
      : p.order
        ? `Order ${p.order.orderNumber}`
        : p.notes || 'Deposit top-up',
    amount: toNumber(p.amount),
    isCredit: true,
  }));

  const depositRows: HistoryRow[] = depositTxns.map((t) => ({
    id: `dep-${t.id}`,
    date: t.createdAt,
    label: DEPOSIT_TYPE_LABELS[t.type] ?? t.type,
    detail:
      t.type === 'USED'
        ? `Dipakai untuk ${t.invoice ? t.invoice.invoiceNumber : t.order ? `order ${t.order.orderNumber}` : 'pembayaran'}`
        : t.type === 'TOP_UP' && t.invoice
          ? `Sisa balance dari pembayaran ${t.invoice.invoiceNumber}`
          : t.order
            ? `Order ${t.order.orderNumber}`
            : t.notes || '—',
    amount: toNumber(t.amount),
    isCredit: t.type === 'TOP_UP',
  }));

  const history = [...paymentRows, ...depositRows].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/portal/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to your orders
        </Link>

        <h1 className="mb-1 font-display text-2xl font-semibold text-primary">Riwayat transaksi</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Semua pembayaran dan aktivitas deposit kamu, dari yang terbaru.
        </p>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Saldo deposit saat ini</p>
            <p className="text-3xl font-semibold text-success">{formatCurrency(depositBalance)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Semua transaksi</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Belum ada transaksi.</p>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((row) => (
                  <li key={row.id} className="flex items-center justify-between p-4 text-sm">
                    <div>
                      <p className="font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(row.date)} · {row.detail}
                      </p>
                    </div>
                    <p className={row.isCredit ? 'font-medium text-success' : 'font-medium text-destructive'}>
                      {row.isCredit ? '+' : '-'}
                      {formatCurrency(row.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
