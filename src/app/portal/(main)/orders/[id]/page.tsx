import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackButton } from '@/components/back-button';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate, formatMonthYear } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';
import { getPackingQueuePosition } from '@/lib/packing-queue';
import { bookFormatLabels } from '@/lib/validations';

const INVOICE_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Deposit',
  FINAL_PAYMENT: 'Final Payment',
  READY_STOCK: 'Ready Stock',
};

const COURIER_LABELS: Record<string, string> = {
  LION: 'Lion Parcel',
  OJEK: 'Ojek (Gojek/Grab)',
  SHOPEE: 'Shopee Express',
  JNE: 'JNE',
  JNT: 'J&T Express',
  SICEPAT: 'SiCepat',
  ANTERAJA: 'AnterAja',
  WAHANA: 'Wahana',
  NINJA: 'Ninja Xpress',
  IDEXPRESS: 'ID Express',
  SENTRAL: 'Sentral Cargo',
};

export default async function PortalOrderDetailPage({ params }: { params: { id: string } }) {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      items: { include: { book: true } },
      payments: { orderBy: { date: 'desc' } },
      invoices: { orderBy: { issuedAt: 'desc' } },
      poBatch: { select: { name: true } },
    },
  });

  // A customer may only ever see their own orders — never trust the URL alone.
  if (!order || order.customerId !== customerId) notFound();

  const queuePosition = order.trackingNumber ? null : await getPackingQueuePosition(order.id);

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <BackButton label="Back to your orders" />
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-primary">
              {order.poBatch?.name ?? order.orderNumber}
            </h1>
            {order.poBatch && <p className="text-sm text-muted-foreground">{order.orderNumber}</p>}
          </div>
          <div className="flex items-center gap-2">
            <PaymentStatusBadge status={order.paymentStatus} />
            <OrderStatusBadge status={order.status} />
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile: compact cards, no horizontal scroll */}
              <div className="divide-y divide-border sm:hidden">
                {order.items.map((item) => (
                  <div key={item.id} className="flex gap-3 p-4">
                    {item.book?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.book.imageUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-14 w-10 shrink-0 rounded bg-secondary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.bookTitle}</p>
                      {(item.isbn || item.format) && (
                        <p className="mb-1.5 text-xs text-muted-foreground">
                          {[item.format ? bookFormatLabels[item.format] ?? item.format : null, item.isbn]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {item.quantity} × {formatCurrency(item.sellingPrice.toString())}
                        </span>
                        <span className="font-medium">{formatCurrency(item.subtotal.toString())}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: full table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Title</th>
                      <th className="px-4 py-2 font-medium text-right">Qty</th>
                      <th className="px-4 py-2 font-medium text-right">Price</th>
                      <th className="px-4 py-2 font-medium text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {item.book?.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.book.imageUrl} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                            ) : (
                              <div className="h-12 w-8 shrink-0 rounded bg-secondary" />
                            )}
                            <div>
                              <p>{item.bookTitle}</p>
                              {(item.isbn || item.format) && (
                                <p className="text-xs text-muted-foreground">
                                  {[item.format ? bookFormatLabels[item.format] ?? item.format : null, item.isbn].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">{item.quantity}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(item.sellingPrice.toString())}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {formatCurrency(item.subtotal.toString())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="Total" value={formatCurrency(order.totalAmount.toString())} bold />
                <Row label="Paid" value={formatCurrency(order.amountPaid.toString())} />
                <Row label="Outstanding" value={formatCurrency(order.outstandingBalance.toString())} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="Order date" value={formatDate(order.orderDate)} />
                <Row label="Estimated arrival" value={formatMonthYear(order.expectedArrivalDate)} />
                <Row label="Arrived" value={formatDate(order.actualArrivalDate)} />
              </CardContent>
            </Card>
          </div>

          {order.trackingNumber && (
            <Card className="border-success/30 bg-success/5">
              <CardHeader>
                <CardTitle className="text-base">Shipping</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="Courier" value={COURIER_LABELS[order.courier ?? ''] ?? order.courier ?? '—'} />
                <Row label="Tracking number" value={order.trackingNumber} bold />
              </CardContent>
            </Card>
          )}

          {queuePosition && (
            <Card className="border-brass/40 bg-brass/5">
              <CardContent className="pt-6 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Packing queue</p>
                <p className="text-2xl font-semibold text-brass">
                  #{queuePosition.position} of {queuePosition.total}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Orders are packed in the order payments come in — you&apos;ll get tracking info
                  once yours is packed and shipped.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment history</CardTitle>
            </CardHeader>
            <CardContent>
              {order.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {order.payments.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span>
                        {formatDate(p.date)} · {p.method}
                      </span>
                      <span className="font-medium">{formatCurrency(p.amount.toString())}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {order.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices issued for this order yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {order.invoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/portal/invoices/${inv.id}`} className="text-sm hover:text-primary">
                        <span>
                          {inv.invoiceNumber} · {INVOICE_TYPE_LABELS[inv.type] ?? inv.type}
                        </span>
                        <span className="ml-2 font-medium">{formatCurrency(inv.amount.toString())}</span>
                      </Link>
                      <div className="flex items-center gap-2">
                        <PaymentStatusBadge status={inv.paymentStatus} />
                        {toNumber(inv.outstandingBalance) > 0 && (
                          <Button size="sm" asChild>
                            <Link href={`/portal/invoices/${inv.id}#bayar`}>Bayar</Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={bold ? 'flex justify-between font-semibold' : 'flex justify-between'}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
