import Link from 'next/link';
import { Plus, Download } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBox } from '@/components/search-box';
import { Pagination } from '@/components/pagination';
import { DeleteButton } from '@/components/delete-button';
import { MultiSelectFilter } from '@/components/multi-select-filter';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate } from '@/lib/utils';
import { orderStatusValues, orderTypeValues, orderTypeLabels } from '@/lib/validations';
import { deleteOrder } from './actions';

const PAGE_SIZE = 15;

const STATUS_LABELS: Record<string, string> = {
  WAITING: 'Open',
  IN_TRANSIT: 'Dalam perjalanan',
  ARRIVED_COUNTRY: 'Tiba di Indonesia',
  ARRIVED: 'Tiba di gudang',
  SHIPPED: 'Terkirim',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERPAID: 'Overpaid',
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    page?: string;
    status?: string;
    paymentStatus?: string;
    batch?: string;
    orderType?: string;
    supplier?: string;
    poMonth?: string;
  };
}) {
  const q = searchParams.q?.trim() ?? '';
  const statuses = (searchParams.status ?? '').split(',').filter(Boolean);
  const paymentStatuses = (searchParams.paymentStatus ?? '').split(',').filter(Boolean);
  const batchIds = (searchParams.batch ?? '').split(',').filter(Boolean);
  const orderTypes = (searchParams.orderType ?? '').split(',').filter(Boolean);
  const supplierIds = (searchParams.supplier ?? '').split(',').filter(Boolean);
  const poMonths = (searchParams.poMonth ?? '').split(',').filter(Boolean);
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const where: Record<string, unknown> = {};
  if (statuses.length > 0) where.status = { in: statuses };
  if (paymentStatuses.length > 0) where.paymentStatus = { in: paymentStatuses };
  if (batchIds.length > 0) where.poBatchId = { in: batchIds };
  if (orderTypes.length > 0) where.orderType = { in: orderTypes };
  if (supplierIds.length > 0) where.supplierId = { in: supplierIds };
  if (poMonths.length > 0) where.poMonth = { in: poMonths };
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q } } },
      { items: { some: { bookTitle: { contains: q, mode: 'insensitive' } } } },
      { items: { some: { isbn: { contains: q } } } },
    ];
  }

  const [orders, total, poBatches, suppliers, poMonthRows] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: true, poBatch: { select: { id: true, name: true } }, supplier: true },
    }),
    prisma.order.count({ where }),
    prisma.purchaseBatch.findMany({ orderBy: { batchDate: 'desc' }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.order.findMany({
      where: { poMonth: { not: null } },
      distinct: ['poMonth'],
      select: { poMonth: true },
      orderBy: { poMonth: 'desc' },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (statuses.length) params.set('status', statuses.join(','));
    if (paymentStatuses.length) params.set('paymentStatus', paymentStatuses.join(','));
    if (batchIds.length) params.set('batch', batchIds.join(','));
    if (orderTypes.length) params.set('orderType', orderTypes.join(','));
    if (supplierIds.length) params.set('supplier', supplierIds.join(','));
    if (poMonths.length) params.set('poMonth', poMonths.join(','));
    params.set('page', String(p));
    return `/admin/orders?${params.toString()}`;
  }

  const exportParams = new URLSearchParams();
  if (q) exportParams.set('q', q);
  if (statuses.length) exportParams.set('status', statuses.join(','));
  if (paymentStatuses.length) exportParams.set('paymentStatus', paymentStatuses.join(','));
  if (batchIds.length) exportParams.set('batch', batchIds.join(','));
  if (orderTypes.length) exportParams.set('orderType', orderTypes.join(','));
  if (supplierIds.length) exportParams.set('supplier', supplierIds.join(','));
  if (poMonths.length) exportParams.set('poMonth', poMonths.join(','));

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">Orders</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
            <a href={`/api/export/orders?${exportParams.toString()}`} download>
              <Download className="h-4 w-4" /> Export ({total} filtered)
            </a>
          </Button>
          <Button asChild className="flex-1 sm:flex-none">
            <Link href="/admin/orders/new">
              <Plus className="h-4 w-4" /> New order
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchBox placeholder="Search order #, customer, judul buku, ISBN…" />
        <MultiSelectFilter
          paramKey="orderType"
          label="Order type"
          options={orderTypeValues.map((t) => ({ value: t, label: orderTypeLabels[t] }))}
        />
        <MultiSelectFilter
          paramKey="supplier"
          label="Supplier"
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
        <MultiSelectFilter
          paramKey="poMonth"
          label="Bulan PO"
          options={poMonthRows
            .filter((r) => r.poMonth)
            .map((r) => ({ value: r.poMonth as string, label: r.poMonth as string }))}
        />
        <MultiSelectFilter
          paramKey="status"
          label="Status"
          options={orderStatusValues.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
        <MultiSelectFilter
          paramKey="paymentStatus"
          label="Payment"
          options={Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <MultiSelectFilter
          paramKey="batch"
          label="PO Batch"
          options={poBatches.map((b) => ({ value: b.id, label: b.name }))}
        />
      </div>

      <Card className="overflow-hidden">
        {/* Mobile: compact cards, no horizontal scroll */}
        <div className="divide-y divide-border md:hidden">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/admin/orders/${o.id}`}
              className="block p-4 hover:bg-secondary/50"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{o.customer.name}</p>
                  <p className="text-xs text-muted-foreground">{o.orderNumber}</p>
                </div>
                <p className="text-sm font-medium">{formatCurrency(o.totalAmount.toString())}</p>
              </div>
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                  {orderTypeLabels[o.orderType] ?? o.orderType}
                </span>
                {o.supplier && (
                  <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    {o.supplier.name}
                  </span>
                )}
                {o.poMonth && (
                  <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    PO {o.poMonth}
                    {o.etaMonth ? ` · ETA ${o.etaMonth}` : ''}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <PaymentStatusBadge status={o.paymentStatus} />
                <OrderStatusBadge status={o.status} />
              </div>
            </Link>
          ))}
          {orders.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No orders found.</p>
          )}
        </div>

        {/* Desktop: full table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Order #</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">PO / ETA</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium text-primary hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{o.customer.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                      {orderTypeLabels[o.orderType] ?? o.orderType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{o.supplier?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {o.poMonth ? (
                      <span>
                        PO {o.poMonth}
                        {o.etaMonth ? ` · ETA ${o.etaMonth}` : ''}
                      </span>
                    ) : (
                      formatDate(o.expectedArrivalDate)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={o.paymentStatus} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(o.totalAmount.toString())}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <DeleteButton
                        action={deleteOrder.bind(null, o.id)}
                        confirmMessage={`Delete order ${o.orderNumber}? If it has payments/invoices on record, it'll be cancelled instead — otherwise it's removed permanently.`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
      </Card>
    </div>
  );
}
