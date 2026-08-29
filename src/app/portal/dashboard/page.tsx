import Link from 'next/link';
import { Pencil, Wallet, HelpCircle } from 'lucide-react';
import { Logo } from '@/components/logo';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { getCustomerDepositBalance } from '@/lib/deposit';
import { SignOutButton } from '@/components/sign-out-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PaymentStatusBadge } from '@/components/status-badges';
import { SearchBox } from '@/components/search-box';
import { UrlFilterSelect } from '@/components/url-filter-select';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERPAID: 'Overpaid',
};

export default async function PortalDashboardPage({
  searchParams,
}: {
  searchParams: { q?: string; batch?: string; paymentStatus?: string; sort?: string };
}) {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const [customer, orders, depositBalance] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.order.findMany({
      where: { customerId, status: { not: 'CANCELLED' } },
      orderBy: { orderDate: 'desc' },
      include: {
        items: true,
        poBatch: { select: { id: true, name: true } },
        invoices: { orderBy: { issuedAt: 'asc' } },
      },
    }),
    getCustomerDepositBalance(customerId),
  ]);

  const outstandingTotal = orders.reduce((sum, o) => sum + toNumber(o.outstandingBalance), 0);

  const q = searchParams.q?.trim().toLowerCase() ?? '';
  const batchFilter = searchParams.batch ?? '';
  const paymentStatusFilter = searchParams.paymentStatus ?? '';
  const sort = searchParams.sort ?? 'recent';

  const batchOptions = Array.from(
    new Map(orders.filter((o) => o.poBatch).map((o) => [o.poBatch!.id, o.poBatch!.name])).entries()
  ).map(([value, label]) => ({ value, label }));

  const filteredOrders = orders
    .filter((o) => !batchFilter || o.poBatchId === batchFilter)
    .filter((o) => !paymentStatusFilter || o.paymentStatus === paymentStatusFilter)
    .filter((o) => !q || o.items.some((it) => it.bookTitle.toLowerCase().includes(q)))
    .sort((a, b) => {
      if (sort === 'amount_desc') return toNumber(b.totalAmount) - toNumber(a.totalAmount);
      if (sort === 'eta_asc') {
        const aEta = a.expectedArrivalDate ? new Date(a.expectedArrivalDate).getTime() : Infinity;
        const bEta = b.expectedArrivalDate ? new Date(b.expectedArrivalDate).getTime() : Infinity;
        return aEta - bEta;
      }
      return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
    });

  const INVOICE_TYPE_LABELS: Record<string, string> = {
    DEPOSIT: 'DP',
    FINAL_PAYMENT: 'Pelunasan',
    READY_STOCK: 'Ready Stock',
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Logo className="max-w-[140px]" />
          <SignOutButton />
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        {/* 1. Profile — name, phone, address */}
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-lg font-bold text-primary">{customer?.name}</p>
              <p className="text-sm text-muted-foreground">{customer?.phone}</p>
              <p className="text-sm text-muted-foreground">
                {customer?.address || 'No address on file yet.'}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
              <Link href="/portal/profile/edit-address">
                <Pencil className="h-4 w-4" /> Update address
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* 2. Outstanding + Deposit, side by side */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Outstanding balance</p>
              <p className="text-2xl font-semibold text-destructive">{formatCurrency(outstandingTotal)}</p>
            </CardContent>
          </Card>
          <Link href="/portal/deposits">
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Deposit balance</p>
                <p className="text-2xl font-semibold">{formatCurrency(depositBalance)}</p>
                <p className="mt-0.5 text-xs text-primary">View full history →</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* 3. Order details — item level, filterable */}
        <Card>
          <CardHeader>
            <CardTitle>Your order details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <SearchBox placeholder="Search by book title…" />
              {batchOptions.length > 0 && (
                <div className="w-44">
                  <UrlFilterSelect paramKey="batch" allLabel="All PO batches" options={batchOptions} />
                </div>
              )}
              <div className="w-40">
                <UrlFilterSelect
                  paramKey="paymentStatus"
                  allLabel="All payment status"
                  options={Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <div className="w-44">
                <UrlFilterSelect
                  paramKey="sort"
                  allLabel="Terbaru"
                  options={[
                    { value: 'amount_desc', label: 'Nominal terbesar' },
                    { value: 'eta_asc', label: 'ETA terdekat' },
                  ]}
                />
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No matching orders.</p>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((o) => (
                  <Link
                    key={o.id}
                    href={`/portal/orders/${o.id}`}
                    className="block rounded-md border border-border p-3 hover:border-primary/40"
                  >
                    <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{o.poBatch?.name ?? o.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.poBatch ? o.orderNumber : 'No batch'}
                          {o.expectedArrivalDate ? ` · ETA ${formatDate(o.expectedArrivalDate)}` : ''}
                        </p>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(toNumber(o.totalAmount))}</p>
                    </div>
                    <ul className="mb-2 list-inside list-disc text-xs text-foreground">
                      {o.items.map((it) => (
                        <li key={it.id}>
                          {it.bookTitle}
                          {it.quantity > 1 ? ` ×${it.quantity}` : ''}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-1.5">
                      {o.invoices.length === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Belum ada invoice
                        </span>
                      ) : (
                        o.invoices.map((inv) => (
                          <span
                            key={inv.id}
                            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                          >
                            {INVOICE_TYPE_LABELS[inv.type] ?? inv.type}
                            <PaymentStatusBadge status={inv.paymentStatus} />
                          </span>
                        ))
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4-5. Top up, FAQ */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/portal/topup">
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-3 pt-6">
                <div className="rounded-md bg-secondary p-2.5">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Top up deposit</p>
                  <p className="text-xs text-muted-foreground">Scan QRIS &amp; notify admin via WhatsApp</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/portal/faq">
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-3 pt-6">
                <div className="rounded-md bg-secondary p-2.5">
                  <HelpCircle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">FAQ</p>
                  <p className="text-xs text-muted-foreground">Quick answers, no WhatsApp needed</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  );
}
