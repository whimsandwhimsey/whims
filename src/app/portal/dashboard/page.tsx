import Link from 'next/link';
import { Pencil, HelpCircle, Truck, Plus } from 'lucide-react';
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
import { PayOngkirButton } from './pay-ongkir-button';

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERPAID: 'Overpaid',
};

const INVOICE_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'DP',
  FINAL_PAYMENT: 'Pelunasan',
  READY_STOCK: 'Ready Stock',
};

export default async function PortalDashboardPage({
  searchParams,
}: {
  searchParams: { q?: string; batch?: string; paymentStatus?: string; sort?: string };
}) {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const [customer, orders, shipments, depositBalance] = await Promise.all([
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
    prisma.shipment.findMany({ where: { customerId } }),
    getCustomerDepositBalance(customerId),
  ]);

  // Outstanding = unpaid books + unpaid ongkir, shown as one number up top
  // with the two pieces broken out right below it — nothing hidden, no
  // number the person has to go hunting for on a different page.
  const outstandingBooks = orders.reduce((sum, o) => sum + toNumber(o.outstandingBalance), 0);
  const outstandingOngkir = shipments.reduce((sum, s) => sum + toNumber(s.outstandingBalance), 0);
  const outstandingTotal = outstandingBooks + outstandingOngkir;

  const q = searchParams.q?.trim().toLowerCase() ?? '';
  const batchFilter = searchParams.batch ?? '';
  const paymentStatusFilter = searchParams.paymentStatus ?? '';
  const sort = searchParams.sort ?? 'recent';

  const batchOptions = Array.from(
    new Map(orders.filter((o) => o.poBatch).map((o) => [o.poBatch!.id, o.poBatch!.name])).entries()
  ).map(([value, label]) => ({ value, label }));

  function firstUnpaidInvoice(o: (typeof orders)[number]) {
    return o.invoices.find((inv) => inv.paymentStatus === 'UNPAID' || inv.paymentStatus === 'PARTIAL');
  }

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
      // Default view: unpaid-invoice orders float to the top so nothing
      // outstanding gets missed, then newest first within each group.
      const aUnpaid = firstUnpaidInvoice(a) ? 1 : 0;
      const bUnpaid = firstUnpaidInvoice(b) ? 1 : 0;
      if (aUnpaid !== bUnpaid) return bUnpaid - aUnpaid;
      return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
    });

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

        {/* 2. Outstanding (total, then books/ongkir breakdown + pay-ongkir) and Deposit, side by side */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div>
                <p className="text-xs text-muted-foreground">Total outstanding</p>
                <p className="text-2xl font-semibold text-destructive">{formatCurrency(outstandingTotal)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Buku</p>
                  <p className="font-medium">{formatCurrency(outstandingBooks)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ongkir</p>
                  <p className="font-medium">{formatCurrency(outstandingOngkir)}</p>
                </div>
              </div>
              {outstandingOngkir > 0 && (
                <PayOngkirButton customerName={customer?.name ?? ''} outstanding={outstandingOngkir} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <div>
                <p className="text-xs text-muted-foreground">Deposit balance</p>
                <p className="text-2xl font-semibold">{formatCurrency(depositBalance)}</p>
              </div>
              <div className="flex gap-2 border-t border-border pt-3">
                <Button asChild size="sm" className="flex-1">
                  <Link href="/portal/topup">
                    <Plus className="h-4 w-4" /> Top up
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link href="/portal/deposits">Riwayat</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
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
                  allLabel="Belum lunas dulu"
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
                {filteredOrders.map((o) => {
                  const unpaidInvoice = firstUnpaidInvoice(o);
                  return (
                    <div
                      key={o.id}
                      className={`rounded-md border p-3 ${
                        unpaidInvoice ? 'border-destructive/40' : 'border-border'
                      }`}
                    >
                      <Link href={`/portal/orders/${o.id}`} className="block hover:opacity-80">
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
                      {unpaidInvoice && (
                        <Button asChild size="sm" className="mt-2 w-full">
                          <Link href={`/portal/invoices/${unpaidInvoice.id}#bayar`}>Bayar sekarang</Link>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4-5. Pengiriman, FAQ */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/portal/shipments">
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-3 pt-6">
                <div className="rounded-md bg-secondary p-2.5">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Pengiriman</p>
                  <p className="text-xs text-muted-foreground">Resi, status kirim, dan isi paketnya</p>
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
