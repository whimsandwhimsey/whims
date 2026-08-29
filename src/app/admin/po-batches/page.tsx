import Link from 'next/link';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { MultiSelectFilter } from '@/components/multi-select-filter';

const TYPE_LABELS: Record<string, string> = {
  PO_REGULAR: 'PO Reguler',
  PO_REMAINDER: 'PO Remainder',
  READY_STOCK: 'Ready Stock',
  EVENT_JASTIP: 'Event / Jastip',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERPAID: 'Overpaid',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  not_invoiced: 'Belum invoice',
  issued: 'Invoice dibuat',
  sent: 'Invoice terkirim',
};

export default async function PoBatchesPage({
  searchParams,
}: {
  searchParams: { sort?: string; paymentStatus?: string; invoiceStatus?: string };
}) {
  const sort = searchParams.sort === 'name' ? 'name' : 'recent';
  const paymentStatuses = (searchParams.paymentStatus ?? '').split(',').filter(Boolean);
  const invoiceStatuses = (searchParams.invoiceStatus ?? '').split(',').filter(Boolean);

  const allBatches = await prisma.purchaseBatch.findMany({
    orderBy: { batchDate: 'desc' },
    include: {
      _count: { select: { orders: true } },
      orders: { select: { paymentStatus: true, invoices: { select: { sentAt: true } } } },
    },
  });

  function invoiceStatusesOfBatch(b: (typeof allBatches)[number]): Set<string> {
    const set = new Set<string>();
    for (const o of b.orders) {
      if (o.invoices.length === 0) set.add('not_invoiced');
      else if (o.invoices.some((i) => i.sentAt)) set.add('sent');
      else set.add('issued');
    }
    return set;
  }

  let batches = allBatches;
  if (paymentStatuses.length > 0) {
    batches = batches.filter((b) => b.orders.some((o) => paymentStatuses.includes(o.paymentStatus)));
  }
  if (invoiceStatuses.length > 0) {
    batches = batches.filter((b) => {
      const statuses = invoiceStatusesOfBatch(b);
      return invoiceStatuses.some((s) => statuses.has(s));
    });
  }
  batches = [...batches].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : b.batchDate.getTime() - a.batchDate.getTime()
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">PO Batches</h1>
          <p className="text-sm text-muted-foreground">{batches.length} total</p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/admin/po-batches/new">
            <Plus className="h-4 w-4" /> New batch
          </Link>
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <MultiSelectFilter
          paramKey="paymentStatus"
          label="Payment"
          options={Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <MultiSelectFilter
          paramKey="invoiceStatus"
          label="Invoice"
          options={Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Link
          href={(() => {
            const p = new URLSearchParams();
            if (paymentStatuses.length) p.set('paymentStatus', paymentStatuses.join(','));
            if (invoiceStatuses.length) p.set('invoiceStatus', invoiceStatuses.join(','));
            if (sort === 'recent') p.set('sort', 'name');
            return `/admin/po-batches?${p.toString()}`;
          })()}
          className="flex h-10 items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {sort === 'recent' ? 'Terbaru dulu' : 'Nama (A-Z)'}
        </Link>
      </div>

      <div className="space-y-2">
        {batches.map((b) => (
          <Link key={b.id} href={`/admin/po-batches/${b.id}`}>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {b.name}
                  <span
                    className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium align-middle ${
                      b.isOpen ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {b.isOpen ? 'Open' : 'Closed'}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">{b._count.orders} order(s)</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {TYPE_LABELS[b.type]} · Opened {formatDate(b.batchDate)}
                {b.expectedArrivalDate ? ` · Expected ${formatDate(b.expectedArrivalDate)}` : ''}
              </p>
            </Card>
          </Link>
        ))}
        {batches.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No PO batches match these filters.
          </p>
        )}
      </div>
    </div>
  );
}
