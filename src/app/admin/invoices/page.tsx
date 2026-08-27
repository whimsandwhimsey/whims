import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { SearchBox } from '@/components/search-box';
import { Pagination } from '@/components/pagination';
import { formatCurrency, formatDate } from '@/lib/utils';

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Deposit',
  FINAL_PAYMENT: 'Final Payment',
  READY_STOCK: 'Ready Stock',
};

function StatusBadges({ paidAt, sentAt }: { paidAt: Date | null; sentAt: Date | null }) {
  return (
    <span className="inline-flex gap-1">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
          paidAt ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
        }`}
      >
        {paidAt ? 'Paid' : 'Unpaid'}
      </span>
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
          sentAt ? 'bg-primary/15 text-primary' : 'bg-amber-100 text-amber-800'
        }`}
      >
        {sentAt ? 'Sent' : 'Not sent'}
      </span>
    </span>
  );
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; sent?: string };
}) {
  const q = searchParams.q?.trim() ?? '';
  const onlyUnsent = searchParams.sent === 'no';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const where: Record<string, unknown> = {};
  if (onlyUnsent) where.sentAt = null;
  if (q) {
    where.OR = [
      { invoiceNumber: { contains: q, mode: 'insensitive' as const } },
      { order: { orderNumber: { contains: q, mode: 'insensitive' as const } } },
      { order: { customer: { name: { contains: q, mode: 'insensitive' as const } } } },
    ];
  }

  const [invoices, total, unsentCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { order: { include: { customer: true } } },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.count({ where: { sentAt: null } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-primary">Invoices</h1>
        <p className="text-sm text-muted-foreground">{total} total</p>
      </div>

      {unsentCount > 0 && !onlyUnsent && (
        <Link
          href="/admin/invoices?sent=no"
          className="mb-4 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span>
            <strong>{unsentCount}</strong> invoice{unsentCount === 1 ? '' : 's'} not sent to the
            customer yet
          </span>
          <span className="font-medium underline underline-offset-2">Review →</span>
        </Link>
      )}
      {onlyUnsent && (
        <Link href="/admin/invoices" className="mb-4 inline-block text-sm text-primary underline underline-offset-2">
          ← Show all invoices
        </Link>
      )}

      <div className="mb-4">
        <SearchBox placeholder="Search by invoice #, order #, or customer…" />
      </div>

      {/* Mobile: stacked cards. Desktop: table. */}
      <div className="space-y-2 sm:hidden">
        {invoices.map((inv) => (
          <Link key={inv.id} href={`/admin/invoices/${inv.id}`}>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{inv.invoiceNumber}</p>
                <p className="font-medium">{formatCurrency(inv.amount.toString())}</p>
              </div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {TYPE_LABELS[inv.type]} · {inv.order.customer.name} · {formatDate(inv.issuedAt)}
              </p>
              <StatusBadges paidAt={inv.paidAt} sentAt={inv.sentAt} />
            </Card>
          </Link>
        ))}
        {invoices.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No invoices yet.</p>
        )}
      </div>

      <Card className="hidden overflow-hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice #</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Issued</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/invoices/${inv.id}`} className="font-medium text-primary hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{TYPE_LABELS[inv.type]}</td>
                  <td className="px-4 py-3">{inv.order.customer.name}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${inv.orderId}`} className="text-primary hover:underline">
                      {inv.order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadges paidAt={inv.paidAt} sentAt={inv.sentAt} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.issuedAt)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(inv.amount.toString())}</td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) =>
            `/admin/invoices?${new URLSearchParams({ ...(q ? { q } : {}), ...(onlyUnsent ? { sent: 'no' } : {}), page: String(p) })}`
          }
        />
      </Card>
    </div>
  );
}
