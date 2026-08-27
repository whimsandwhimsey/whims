import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { Card } from '@/components/ui/card';
import { SearchBox } from '@/components/search-box';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate } from '@/lib/utils';
import { orderStatusValues } from '@/lib/validations';
import { PortalStatusFilter } from './status-filter';

export default async function PortalOrdersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const q = searchParams.q?.trim() ?? '';
  const status = searchParams.status ?? '';

  const where: Record<string, unknown> = { customerId };
  if (status && orderStatusValues.includes(status as (typeof orderStatusValues)[number])) {
    where.status = status;
  }
  if (q) {
    where.orderNumber = { contains: q, mode: 'insensitive' as const };
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { orderDate: 'desc' },
    include: { items: true },
  });

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/portal/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        <h1 className="mb-1 font-display text-2xl font-semibold text-primary">Your order history</h1>
        <p className="mb-6 text-sm text-muted-foreground">{orders.length} order(s)</p>

        <div className="mb-4 flex flex-wrap gap-3">
          <SearchBox placeholder="Search by order number…" />
          <div className="w-48">
            <PortalStatusFilter />
          </div>
        </div>

        <Card className="overflow-hidden">
          {orders.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No orders match.</p>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/portal/orders/${order.id}`}
                    className="flex flex-col gap-2 p-4 hover:bg-secondary/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.items.length} item(s) · Ordered {formatDate(order.orderDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PaymentStatusBadge status={order.paymentStatus} />
                      <OrderStatusBadge status={order.status} />
                      <span className="w-24 text-right text-sm font-medium">
                        {formatCurrency(order.totalAmount.toString())}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
