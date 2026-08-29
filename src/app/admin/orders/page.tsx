import Link from 'next/link';
import { Plus, Download } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBox } from '@/components/search-box';
import { Pagination } from '@/components/pagination';
import { MultiSelectFilter } from '@/components/multi-select-filter';
import { SortSelect } from '@/components/sort-select';
import { orderStatusValues, orderTypeValues, orderTypeLabels } from '@/lib/validations';
import { OrdersList } from './orders-list';

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
    publisher?: string;
    sort?: string;
  };
}) {
  const q = searchParams.q?.trim() ?? '';
  const statuses = (searchParams.status ?? '').split(',').filter(Boolean);
  const paymentStatuses = (searchParams.paymentStatus ?? '').split(',').filter(Boolean);
  const batchIds = (searchParams.batch ?? '').split(',').filter(Boolean);
  const orderTypes = (searchParams.orderType ?? '').split(',').filter(Boolean);
  const supplierIds = (searchParams.supplier ?? '').split(',').filter(Boolean);
  const poMonths = (searchParams.poMonth ?? '').split(',').filter(Boolean);
  const publisherIds = (searchParams.publisher ?? '').split(',').filter(Boolean);
  const sort = ['oldest', 'name_asc', 'name_desc'].includes(searchParams.sort ?? '') ? searchParams.sort! : 'newest';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const where: Record<string, unknown> = {};
  if (statuses.length > 0) where.status = { in: statuses };
  if (paymentStatuses.length > 0) where.paymentStatus = { in: paymentStatuses };
  if (batchIds.length > 0) where.poBatchId = { in: batchIds };
  if (orderTypes.length > 0) where.orderType = { in: orderTypes };
  if (supplierIds.length > 0) where.supplierId = { in: supplierIds };
  if (poMonths.length > 0) where.poMonth = { in: poMonths };
  if (publisherIds.length > 0) {
    where.items = { some: { book: { publisherId: { in: publisherIds } } } };
  }
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q } } },
      { items: { some: { bookTitle: { contains: q, mode: 'insensitive' } } } },
      { items: { some: { isbn: { contains: q } } } },
    ];
  }

  const [orders, total, poBatches, suppliers, publishers, poMonthRows] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy:
        sort === 'name_asc'
          ? { customer: { name: 'asc' } }
          : sort === 'name_desc'
            ? { customer: { name: 'desc' } }
            : { orderDate: sort === 'oldest' ? 'asc' : 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: true,
        poBatch: { select: { id: true, name: true } },
        supplier: true,
        items: true,
        invoices: { select: { id: true, sentAt: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.purchaseBatch.findMany({ orderBy: { batchDate: 'desc' }, select: { id: true, name: true, type: true } }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.publisher.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
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
    if (publisherIds.length) params.set('publisher', publisherIds.join(','));
    if (sort !== 'newest') params.set('sort', sort);
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
  if (publisherIds.length) exportParams.set('publisher', publisherIds.join(','));

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
          paramKey="publisher"
          label="Publisher"
          options={publishers.map((p) => ({ value: p.id, label: p.name }))}
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
        <SortSelect
          defaultValue="newest"
          options={[
            { value: 'newest', label: 'Terbaru dulu' },
            { value: 'oldest', label: 'Terlama dulu' },
            { value: 'name_asc', label: 'Customer (A-Z)' },
            { value: 'name_desc', label: 'Customer (Z-A)' },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        <OrdersList orders={orders as any} poBatches={poBatches} />
        <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
      </Card>
    </div>
  );
}
