import Link from 'next/link';
import { Download, Pencil } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBox } from '@/components/search-box';
import { Pagination } from '@/components/pagination';
import { DeleteButton } from '@/components/delete-button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { deletePayment } from './actions';

const PAGE_SIZE = 20;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const q = searchParams.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const where = q
    ? {
        OR: [
          { customer: { name: { contains: q, mode: 'insensitive' as const } } },
          { customer: { phone: { contains: q } } },
          { order: { orderNumber: { contains: q, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: true, order: { select: { id: true, orderNumber: true } } },
    }),
    prisma.payment.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">Payments</h1>
          <p className="text-sm text-muted-foreground">{total} total · QRIS &amp; Bank Transfer only</p>
        </div>
        <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
          <a href="/api/export/payments" download>
            <Download className="h-4 w-4" /> Export
          </a>
        </Button>
      </div>

      <div className="mb-4">
        <SearchBox placeholder="Search by customer, phone, or order #…" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(p.date)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/customers/${p.customerId}`} className="text-primary hover:underline">
                      {p.customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {p.order ? (
                      <Link href={`/admin/orders/${p.order.id}`} className="text-primary hover:underline">
                        {p.order.orderNumber}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Deposit top-up</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{p.method === 'BANK_TRANSFER' ? 'Bank Transfer' : 'QRIS'}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">{p.notes || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.amount.toString())}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/payments/${p.id}/edit?returnTo=/admin/payments`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <DeleteButton
                        action={async () => {
                          'use server';
                          const result = await deletePayment(p.id);
                          if (!result.success) throw new Error(result.error);
                        }}
                        confirmMessage="Delete this payment? Order totals and deposit balance will be recalculated."
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) => `/admin/payments?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`}
        />
      </Card>
    </div>
  );
}
