import Link from 'next/link';
import { Pencil, PackageSearch, Wallet, HelpCircle } from 'lucide-react';
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
import { formatCurrency } from '@/lib/utils';
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
  searchParams: { q?: string; batch?: string; paymentStatus?: string };
}) {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const [customer, orders, depositBalance] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.order.findMany({
      where: { customerId, status: { not: 'CANCELLED' } },
      orderBy: { orderDate: 'desc' },
      include: { items: true, poBatch: { select: { id: true, name: true } } },
    }),
    getCustomerDepositBalance(customerId),
  ]);

  const outstandingTotal = orders.reduce((sum, o) => sum + toNumber(o.outstandingBalance), 0);

  // Flatten to item-level rows (book title, batch, price, qty, payment status).
  const q = searchParams.q?.trim().toLowerCase() ?? '';
  const batchFilter = searchParams.batch ?? '';
  const paymentStatusFilter = searchParams.paymentStatus ?? '';

  const batchOptions = Array.from(
    new Map(orders.filter((o) => o.poBatch).map((o) => [o.poBatch!.id, o.poBatch!.name])).entries()
  ).map(([value, label]) => ({ value, label }));

  const itemRows = orders
    .filter((o) => !batchFilter || o.poBatchId === batchFilter)
    .filter((o) => !paymentStatusFilter || o.paymentStatus === paymentStatusFilter)
    .flatMap((o) =>
      o.items
        .filter((it) => !q || it.bookTitle.toLowerCase().includes(q))
        .map((it) => ({
          key: it.id,
          orderId: o.id,
          orderNumber: o.orderNumber,
          bookTitle: it.bookTitle,
          quantity: it.quantity,
          sellingPrice: toNumber(it.sellingPrice),
          batchName: o.poBatch?.name ?? '—',
          paymentStatus: o.paymentStatus,
        }))
    );

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
            </div>

            {itemRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No matching items.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-2 font-medium">Book</th>
                      <th className="py-2 pr-2 font-medium">PO Batch</th>
                      <th className="py-2 pr-2 text-right font-medium">Qty</th>
                      <th className="py-2 pr-2 text-right font-medium">Price</th>
                      <th className="py-2 font-medium">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {itemRows.map((row) => (
                      <tr key={row.key}>
                        <td className="py-2 pr-2">
                          <Link href={`/portal/orders/${row.orderId}`} className="hover:text-primary hover:underline">
                            {row.bookTitle}
                          </Link>
                          <p className="text-xs text-muted-foreground">{row.orderNumber}</p>
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">{row.batchName}</td>
                        <td className="py-2 pr-2 text-right">{row.quantity}</td>
                        <td className="py-2 pr-2 text-right">{formatCurrency(row.sellingPrice)}</td>
                        <td className="py-2">
                          <PaymentStatusBadge status={row.paymentStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4-6. Top up, Upcoming bookmail, FAQ */}
        <div className="grid gap-3 sm:grid-cols-3">
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
          <Link href="/portal/pre-orders">
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-3 pt-6">
                <div className="rounded-md bg-secondary p-2.5">
                  <PackageSearch className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Upcoming bookmail</p>
                  <p className="text-xs text-muted-foreground">Batches &amp; outstanding by arrival</p>
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
