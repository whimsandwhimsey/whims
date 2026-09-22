import Link from 'next/link';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { MultiSelectFilter } from '@/components/multi-select-filter';
import { SortSelect } from '@/components/sort-select';
import { SearchBox } from '@/components/search-box';
import { BatchOpenToggle } from './batch-open-toggle';

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
  searchParams: {
    q?: string;
    sort?: string;
    paymentStatus?: string;
    invoiceStatus?: string;
    supplier?: string;
    tab?: string;
  };
}) {
  const q = searchParams.q?.trim().toLowerCase() ?? '';
  const sort = ['name_asc', 'name_desc', 'eta_asc', 'eta_desc'].includes(searchParams.sort ?? '')
    ? searchParams.sort!
    : 'recent';
  const paymentStatuses = (searchParams.paymentStatus ?? '').split(',').filter(Boolean);
  const invoiceStatuses = (searchParams.invoiceStatus ?? '').split(',').filter(Boolean);
  const supplierIds = (searchParams.supplier ?? '').split(',').filter(Boolean);
  const tab = searchParams.tab === 'closed' ? 'closed' : 'open';

  const [allBatches, suppliers] = await Promise.all([
    prisma.purchaseBatch.findMany({
      orderBy: { batchDate: 'desc' },
      include: {
        supplier: { select: { id: true, name: true } },
        _count: { select: { orders: true } },
        orders: { select: { paymentStatus: true, invoices: { select: { sentAt: true } } } },
      },
    }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  function invoiceStatusesOfBatch(b: (typeof allBatches)[number]): Set<string> {
    const set = new Set<string>();
    for (const o of b.orders) {
      if (o.invoices.length === 0) set.add('not_invoiced');
      else if (o.invoices.some((i) => i.sentAt)) set.add('sent');
      else set.add('issued');
    }
    return set;
  }

  let batches = allBatches.filter((b) => (tab === 'open' ? b.isOpen : !b.isOpen));
  if (q) {
    batches = batches.filter(
      (b) => b.name.toLowerCase().includes(q) || (b.supplier?.name ?? '').toLowerCase().includes(q)
    );
  }
  if (paymentStatuses.length > 0) {
    batches = batches.filter((b) => b.orders.some((o) => paymentStatuses.includes(o.paymentStatus)));
  }
  if (invoiceStatuses.length > 0) {
    batches = batches.filter((b) => {
      const statuses = invoiceStatusesOfBatch(b);
      return invoiceStatuses.some((s) => statuses.has(s));
    });
  }
  if (supplierIds.length > 0) {
    batches = batches.filter((b) => b.supplierId && supplierIds.includes(b.supplierId));
  }

  batches = [...batches].sort((a, b) => {
    if (sort === 'name_asc') return a.name.localeCompare(b.name);
    if (sort === 'name_desc') return b.name.localeCompare(a.name);
    if (sort === 'eta_asc') return (a.etaMonth ?? '9999').localeCompare(b.etaMonth ?? '9999');
    if (sort === 'eta_desc') return (b.etaMonth ?? '0000').localeCompare(a.etaMonth ?? '0000');
    return b.batchDate.getTime() - a.batchDate.getTime();
  });

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

      <div className="mb-4 flex gap-1 rounded-md bg-secondary p-1 sm:inline-flex">
        <Link
          href={(() => {
            const p = new URLSearchParams();
            if (q) p.set('q', q);
            if (paymentStatuses.length) p.set('paymentStatus', paymentStatuses.join(','));
            if (invoiceStatuses.length) p.set('invoiceStatus', invoiceStatuses.join(','));
            if (supplierIds.length) p.set('supplier', supplierIds.join(','));
            return `/admin/po-batches?${p.toString()}`;
          })()}
          className={`flex-1 rounded px-3 py-1.5 text-center text-sm font-medium sm:flex-none ${
            tab === 'open' ? 'bg-card shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Open
        </Link>
        <Link
          href={(() => {
            const p = new URLSearchParams();
            p.set('tab', 'closed');
            if (q) p.set('q', q);
            if (paymentStatuses.length) p.set('paymentStatus', paymentStatuses.join(','));
            if (invoiceStatuses.length) p.set('invoiceStatus', invoiceStatuses.join(','));
            if (supplierIds.length) p.set('supplier', supplierIds.join(','));
            return `/admin/po-batches?${p.toString()}`;
          })()}
          className={`flex-1 rounded px-3 py-1.5 text-center text-sm font-medium sm:flex-none ${
            tab === 'closed' ? 'bg-card shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Closed
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchBox placeholder="Cari nama batch atau supplier…" />
        <MultiSelectFilter
          paramKey="supplier"
          label="Supplier"
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
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
        <SortSelect
          defaultValue="recent"
          options={[
            { value: 'recent', label: 'Tanggal dibuka (terbaru)' },
            { value: 'name_asc', label: 'Nama (A-Z)' },
            { value: 'name_desc', label: 'Nama (Z-A)' },
            { value: 'eta_asc', label: 'ETA (terdekat)' },
            { value: 'eta_desc', label: 'ETA (terjauh)' },
          ]}
        />
      </div>

      <div className="space-y-2">
        {batches.map((b) => (
          <Link key={b.id} href={`/admin/po-batches/${b.id}`}>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {b.name}
                  <BatchOpenToggle batchId={b.id} isOpen={b.isOpen} />
                </p>
                <p className="text-sm text-muted-foreground">{b._count.orders} order(s)</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {TYPE_LABELS[b.type]}
                {b.supplier ? ` · ${b.supplier.name}` : ''} · Opened {formatDate(b.batchDate)}
                {b.etaMonth ? ` · ETA ${b.etaMonth}` : ''}
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
