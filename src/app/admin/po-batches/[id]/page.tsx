import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteButton } from '@/components/delete-button';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate } from '@/lib/utils';
import { deletePoBatch, togglePoBatchOpen } from '../actions';
import { GenerateInvoicesButton } from '../generate-invoices-button';
import { BatchStatusChanger } from '../batch-status-changer';
import { MultiSelectFilter } from '@/components/multi-select-filter';
import { SortSelect } from '@/components/sort-select';
import { ExportBuilderButton } from '@/components/export-builder-button';

const TYPE_LABELS: Record<string, string> = {
  PO_REGULAR: 'PO Reguler',
  PO_REMAINDER: 'PO Remainder',
  READY_STOCK: 'Ready Stock',
  EVENT_JASTIP: 'Event / Jastip',
};

const TYPE_RULE: Record<string, string> = {
  PO_REGULAR: 'DP per order, sesuai DP rule masing-masing order',
  PO_REMAINDER: 'DP per order, sesuai DP rule masing-masing order',
  READY_STOCK: 'Full order amount',
  EVENT_JASTIP: 'Full order amount',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERPAID: 'Overpaid',
};

export default async function PoBatchDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { sort?: string; paymentStatus?: string };
}) {
  const batch = await prisma.purchaseBatch.findUnique({
    where: { id: params.id },
    include: {
      orders: {
        include: { customer: true, items: true },
        orderBy: { orderDate: 'desc' },
      },
    },
  });
  if (!batch) notFound();

  const bookSummary = new Map<string, { title: string; quantity: number; subtotal: number }>();
  for (const o of batch.orders) {
    for (const it of o.items) {
      const key = it.isbn || it.bookTitle;
      const existing = bookSummary.get(key);
      const subtotal = Number(it.subtotal.toString());
      if (existing) {
        existing.quantity += it.quantity;
        existing.subtotal += subtotal;
      } else {
        bookSummary.set(key, { title: it.bookTitle, quantity: it.quantity, subtotal });
      }
    }
  }
  const bookRows = [...bookSummary.values()].sort((a, b) => a.title.localeCompare(b.title));
  const totalBookQuantity = bookRows.reduce((sum, r) => sum + r.quantity, 0);

  const paymentStatuses = (searchParams.paymentStatus ?? '').split(',').filter(Boolean);
  const sort = searchParams.sort === 'name_desc' ? 'name_desc' : searchParams.sort === 'name_asc' ? 'name_asc' : 'recent';

  let displayOrders = batch.orders;
  if (paymentStatuses.length > 0) {
    displayOrders = displayOrders.filter((o) => paymentStatuses.includes(o.paymentStatus));
  }
  displayOrders = [...displayOrders].sort((a, b) => {
    if (sort === 'name_asc') return a.customer.name.localeCompare(b.customer.name);
    if (sort === 'name_desc') return b.customer.name.localeCompare(a.customer.name);
    return b.orderDate.getTime() - a.orderDate.getTime();
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/admin/po-batches"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to PO batches
        </Link>
        <div className="flex flex-wrap gap-2">
          <ExportBuilderButton batchId={batch.id} />
          <form action={togglePoBatchOpen.bind(null, batch.id, !batch.isOpen)}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className={batch.isOpen ? '' : 'border-success/40 text-success'}
            >
              {batch.isOpen ? 'Close batch' : 'Reopen batch'}
            </Button>
          </form>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/po-batches/${batch.id}/edit`}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </Button>
          <DeleteButton
            action={deletePoBatch.bind(null, batch.id)}
            confirmMessage={`Delete "${batch.name}"? Only possible if no orders are linked.`}
            redirectTo="/admin/po-batches"
          />
        </div>
      </div>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-primary">
          {batch.name}
          <span
            className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium align-middle ${
              batch.isOpen ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
            }`}
          >
            {batch.isOpen ? 'Open' : 'Closed'}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {TYPE_LABELS[batch.type]} · Opened {formatDate(batch.batchDate)}
          {batch.expectedArrivalDate ? ` · Expected ${formatDate(batch.expectedArrivalDate)}` : ''}
        </p>
        <p className="mt-1 text-sm text-brass">Invoice rule: {TYPE_RULE[batch.type]}</p>
        {batch.notes && <p className="mt-2 text-sm text-muted-foreground">{batch.notes}</p>}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            Ringkasan buku ({bookRows.length} judul, {totalBookQuantity} eksemplar)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {bookRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Belum ada item.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Judul</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bookRows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2">{r.title}</td>
                    <td className="px-4 py-2 text-right">{r.quantity}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Bulk invoicing</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateInvoicesButton batchId={batch.id} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Shipping status</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchStatusChanger poBatchId={batch.id} orderCount={batch.orders.length} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders in this batch ({batch.orders.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {batch.orders.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-border p-4">
              <MultiSelectFilter
                paramKey="paymentStatus"
                label="Payment"
                options={Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <SortSelect
                defaultValue="recent"
                options={[
                  { value: 'recent', label: 'Terbaru dulu' },
                  { value: 'name_asc', label: 'Customer (A-Z)' },
                  { value: 'name_desc', label: 'Customer (Z-A)' },
                ]}
              />
            </div>
          )}
          {batch.orders.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No orders assigned to this batch yet — pick it from the &quot;PO Batch&quot; field when creating
              or editing an order.
            </p>
          ) : displayOrders.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No orders match this filter.</p>
          ) : (
            <ul className="divide-y divide-border">
              {displayOrders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="flex flex-col gap-2 p-4 hover:bg-secondary/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{o.customer.name}</p>
                      <p className="text-xs text-muted-foreground">{o.orderNumber}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PaymentStatusBadge status={o.paymentStatus} />
                      <OrderStatusBadge status={o.status} />
                      <span className="w-24 text-right font-medium">
                        {formatCurrency(o.totalAmount.toString())}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
