import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { ShippingForm } from './shipping-form';
import { PackedCheckbox } from './packed-checkbox';
import { PackingNoteField } from './packing-note-field';

export default async function PackingListPage() {
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['ARRIVED'] },
      paymentStatus: { in: ['PAID', 'OVERPAID'] },
    },
    include: {
      customer: { include: { packingNote: true } },
      items: { include: { book: true } },
      payments: { orderBy: { date: 'desc' }, take: 1 },
      poBatch: { select: { name: true } },
    },
  });

  // Group by customer — the same person can have several orders (from
  // different PO batches) that get packed and shipped together as one
  // parcel, so the packer should see one combined card, not N duplicates.
  type Group = {
    customer: (typeof orders)[number]['customer'];
    orders: typeof orders;
    paidDate: Date;
  };
  const groups = new Map<string, Group>();
  for (const o of orders) {
    const paidDate = o.payments[0]?.date ?? o.orderDate;
    const existing = groups.get(o.customerId);
    if (existing) {
      existing.orders.push(o);
      if (paidDate < existing.paidDate) existing.paidDate = paidDate;
    } else {
      groups.set(o.customerId, { customer: o.customer, orders: [o], paidDate });
    }
  }

  // Sort by whichever group got fully paid first — first paid, first packed.
  const sorted = [...groups.values()].sort((a, b) => a.paidDate.getTime() - b.paidDate.getTime());

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-primary">Packing List</h1>
        <p className="text-sm text-muted-foreground">
          {sorted.length} customer(s) ready to pack — fully paid and arrived at the warehouse, in
          the order they got paid off. Work top to bottom so nothing gets skipped.
        </p>
      </div>

      <div className="space-y-3">
        {sorted.map(({ customer, orders: groupOrders }, index) => {
          const orderIds = groupOrders.map((o) => o.id);
          const allItems = groupOrders.flatMap((o) => o.items.map((it) => ({ ...it, poBatchName: o.poBatch?.name })));
          const allPacked = allItems.length > 0 && allItems.every((it) => it.packedAt);
          const anyTracking = groupOrders.find((o) => o.trackingNumber);

          return (
            <Card key={customer.id} className={`p-4 ${allPacked ? 'bg-secondary/40' : ''}`}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">#{index + 1} in queue</p>
                  <p className={`font-medium ${allPacked ? 'line-through text-muted-foreground' : ''}`}>
                    {customer.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{customer.phone}</p>
                  {customer.address && (
                    <p className="text-xs text-muted-foreground">{customer.address}</p>
                  )}
                </div>
              </div>

              <ul className="mb-3 space-y-1.5">
                {allItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <PackedCheckbox itemId={item.id} initialChecked={!!item.packedAt} />
                    {item.book?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.book.imageUrl} alt="" className="h-8 w-6 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-6 shrink-0 rounded bg-secondary" />
                    )}
                    <span className={item.packedAt ? 'line-through' : ''}>
                      {item.bookTitle} × {item.quantity}
                    </span>
                    {item.poBatchName && (
                      <span className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        {item.poBatchName}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mb-3">
                <PackingNoteField customerId={customer.id} initialNote={customer.packingNote?.note ?? ''} />
              </div>

              {anyTracking && (
                <p className="mb-2 text-xs text-success">
                  Already has tracking: {anyTracking.trackingNumber}
                </p>
              )}

              <ShippingForm
                orderIds={orderIds}
                initialCourier={groupOrders[0].courier}
                initialTracking={groupOrders[0].trackingNumber}
              />

              <div className="mt-2 flex flex-wrap gap-2">
                {groupOrders.map((o) => (
                  <Link
                    key={o.id}
                    href={`/admin/orders/${o.id}`}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {o.orderNumber}
                  </Link>
                ))}
              </div>
            </Card>
          );
        })}

        {sorted.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing to pack right now — orders show up here once fully paid and marked as arrived
            at the warehouse.
          </p>
        )}
      </div>
    </div>
  );
}
