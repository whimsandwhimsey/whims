import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { OrderStatusBadge } from '@/components/status-badges';
import { ShippingForm } from './shipping-form';
import { formatDate } from '@/lib/utils';

export default async function PackingListPage() {
  const orders = await prisma.order.findMany({
    where: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      payments: { some: {} },
    },
    include: {
      customer: true,
      items: true,
      payments: { orderBy: { date: 'asc' }, take: 1 },
    },
  });

  // Sort by the earliest payment date for each order — first paid, first packed.
  const sorted = orders
    .map((o) => ({ order: o, firstPaymentDate: o.payments[0]?.date ?? o.orderDate }))
    .sort((a, b) => a.firstPaymentDate.getTime() - b.firstPaymentDate.getTime());

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-primary">Packing List</h1>
        <p className="text-sm text-muted-foreground">
          {sorted.length} order(s) to pack, in the order their payments came in — work top to bottom
          so nothing gets skipped.
        </p>
      </div>

      <div className="space-y-3">
        {sorted.map(({ order }, index) => (
          <Card key={order.id} className="p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">#{index + 1} in queue</p>
                <Link href={`/admin/orders/${order.id}`} className="font-medium text-primary hover:underline">
                  {order.orderNumber}
                </Link>
                <p className="text-sm">{order.customer.name}</p>
                <p className="text-xs text-muted-foreground">{order.customer.phone}</p>
                {order.customer.address && (
                  <p className="text-xs text-muted-foreground">{order.customer.address}</p>
                )}
              </div>
              <OrderStatusBadge status={order.status} />
            </div>

            <ul className="mb-3 space-y-0.5 text-sm text-muted-foreground">
              {order.items.map((item) => (
                <li key={item.id}>
                  {item.bookTitle} × {item.quantity}
                </li>
              ))}
            </ul>

            {order.trackingNumber && (
              <p className="mb-2 text-xs text-success">
                Already has tracking: {order.trackingNumber}
              </p>
            )}

            <ShippingForm
              orderId={order.id}
              initialCourier={order.courier}
              initialTracking={order.trackingNumber}
            />
          </Card>
        ))}

        {sorted.length === 0 && (
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing to pack right now — orders show up here once a payment has been recorded.
          </CardContent>
        )}
      </div>
    </div>
  );
}
