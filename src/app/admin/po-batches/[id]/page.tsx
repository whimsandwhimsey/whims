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
import { Download } from 'lucide-react';

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

export default async function PoBatchDetailPage({ params }: { params: { id: string } }) {
  const batch = await prisma.purchaseBatch.findUnique({
    where: { id: params.id },
    include: {
      orders: {
        include: { customer: true },
        orderBy: { orderDate: 'desc' },
      },
    },
  });
  if (!batch) notFound();

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
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/export/po-batch/${batch.id}`} download>
              <Download className="h-4 w-4" /> Export
            </a>
          </Button>
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
          {batch.orders.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No orders assigned to this batch yet — pick it from the &quot;PO Batch&quot; field when creating
              or editing an order.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {batch.orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="flex flex-col gap-2 p-4 hover:bg-secondary/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{o.customer.name}</p>
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
