import Link from 'next/link';
import { Plus, Pencil, X, Download } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBox } from '@/components/search-box';
import { Pagination } from '@/components/pagination';
import { DeleteButton } from '@/components/delete-button';
import { CustomerStatusFilterSelect } from './customer-status-filter';
import { CustomerSortSelect } from './customer-sort';
import { ImportCustomersForm } from './import-customers-form';
import { DepositTopUpForm } from './deposit-topup-form';
import { ApproveCustomerButton } from './approve-customer-button';
import { deleteCustomer, rejectCustomer } from './actions';

const PAGE_SIZE = 15;

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-success/15 text-success',
  REJECTED: 'bg-destructive/10 text-destructive',
  ARCHIVED: 'bg-muted text-muted-foreground',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending approval',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; status?: string; sort?: string };
}) {
  const q = searchParams.q?.trim() ?? '';
  const status = searchParams.status ?? '';
  const sort = searchParams.sort ?? 'recent';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const orderBy =
    sort === 'name_asc'
      ? [{ name: 'asc' as const }]
      : sort === 'name_desc'
        ? [{ name: 'desc' as const }]
        : sort === 'orders_desc'
          ? [{ orders: { _count: 'desc' as const } }]
          : [{ status: 'asc' as const }, { createdAt: 'desc' as const }];

  const where: Record<string, unknown> = {};
  if (status && ['PENDING', 'ACTIVE', 'REJECTED', 'ARCHIVED'].includes(status)) {
    where.status = status;
  } else {
    // Archived (soft-deleted) customers are hidden by default — visible
    // only via the explicit "Archived" filter.
    where.status = { not: 'ARCHIVED' };
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' as const } },
      { phone: { contains: q } },
    ];
  }

  const [customers, total, pendingCount] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { orders: true } } },
    }),
    prisma.customer.count({ where }),
    prisma.customer.count({ where: { status: 'PENDING' } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">Customers</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
            <a href="/api/export/customers" download>
              <Download className="h-4 w-4" /> Export
            </a>
          </Button>
          <Button asChild className="flex-1 sm:flex-none">
            <Link href="/admin/customers/new">
              <Plus className="h-4 w-4" /> New customer
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <ImportCustomersForm />
      </div>

      {pendingCount > 0 && status !== 'PENDING' && (
        <Link
          href="/admin/customers?status=PENDING"
          className="mb-4 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span>
            <strong>{pendingCount}</strong> signup request{pendingCount === 1 ? '' : 's'} waiting for
            approval
          </span>
          <span className="font-medium underline underline-offset-2">Review →</span>
        </Link>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchBox placeholder="Search by name or phone…" />
        <div className="w-48">
          <CustomerStatusFilterSelect />
        </div>
        <div className="w-52">
          <CustomerSortSelect />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Orders</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/customers/${c.id}`} className="text-primary hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{c.phone}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                    {c.address || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status] ?? ''}`}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{c._count.orders}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {c.status === 'PENDING' && (
                        <>
                          <ApproveCustomerButton
                            customerId={c.id}
                            customerName={c.name}
                            customerPhone={c.phone}
                          />
                          <form action={rejectCustomer.bind(null, c.id)}>
                            <Button type="submit" variant="ghost" size="sm" title="Reject">
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </form>
                        </>
                      )}
                      <DepositTopUpForm customerId={c.id} />
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/customers/${c.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <DeleteButton
                        action={deleteCustomer.bind(null, c.id)}
                        confirmMessage={`Delete ${c.name}? If they have order history, they'll be archived instead (order records are kept) — otherwise they're removed permanently.`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No customers found.
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
            `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(sort !== 'recent' ? { sort } : {}), page: String(p) })}`
          }
        />
      </Card>
    </div>
  );
}
