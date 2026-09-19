import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';

const BATCH_TYPE_LABELS: Record<string, string> = {
  FAST: 'Fast PO (4–8 weeks)',
  REGULAR: 'PO Reg (4–5 months)',
  READY_STOCK: 'Ready Stock',
};

export default async function PortalPreOrdersPage() {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const orders = await prisma.order.findMany({
    where: { customerId, status: { not: 'CANCELLED' } },
    include: { items: true, poBatch: true },
    orderBy: { orderDate: 'desc' },
  });

  // Group by PO batch (orders with no batch each get their own "group").
  type Group = {
    key: string;
    label: string;
    type: string | null;
    expectedArrival: Date | null;
    orderNumbers: string[];
    books: Map<string, number>;
    outstanding: number;
  };
  const groups = new Map<string, Group>();

  for (const order of orders) {
    const key = order.poBatchId ?? `order:${order.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: order.poBatch?.name ?? order.orderNumber,
        type: order.poBatch?.type ?? null,
        expectedArrival: order.poBatch?.expectedArrivalDate ?? order.expectedArrivalDate,
        orderNumbers: [],
        books: new Map(),
        outstanding: 0,
      });
    }
    const group = groups.get(key)!;
    group.orderNumbers.push(order.orderNumber);
    group.outstanding += toNumber(order.outstandingBalance);
    for (const item of order.items) {
      group.books.set(item.bookTitle, (group.books.get(item.bookTitle) ?? 0) + item.quantity);
    }
  }

  const groupList = Array.from(groups.values()).sort((a, b) => {
    if (!a.expectedArrival) return 1;
    if (!b.expectedArrival) return -1;
    return a.expectedArrival.getTime() - b.expectedArrival.getTime();
  });

  // Group by arrival month across everything.
  const byMonth = new Map<string, number>();
  for (const group of groupList) {
    const monthKey = group.expectedArrival
      ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(group.expectedArrival)
      : 'No date yet';
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + group.outstanding);
  }

  const grandTotal = groupList.reduce((sum, g) => sum + g.outstanding, 0);

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/portal/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to your orders
        </Link>

        <h1 className="mb-1 font-display text-2xl font-semibold text-primary">Your pre-orders</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          What you&apos;ve ordered, which batch it&apos;s in, and what&apos;s still outstanding.
        </p>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total outstanding across everything</p>
            <p className="text-3xl font-semibold text-destructive">{formatCurrency(grandTotal)}</p>
          </CardContent>
        </Card>

        {byMonth.size > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Outstanding by arrival month</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {Array.from(byMonth.entries()).map(([month, total]) => (
                <div key={month} className="flex justify-between">
                  <span className="text-muted-foreground">{month}</span>
                  <span className="font-medium">{formatCurrency(total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {groupList.map((group) => (
            <Card key={group.key}>
              <CardHeader>
                <CardTitle className="text-base">{group.label}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {group.type ? BATCH_TYPE_LABELS[group.type] ?? group.type : 'Single order'}
                  {group.expectedArrival ? ` · Expected ${formatDate(group.expectedArrival)}` : ''}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="mb-3 space-y-0.5 text-sm">
                  {Array.from(group.books.entries()).map(([title, qty]) => (
                    <li key={title} className="text-muted-foreground">
                      {title} × {qty}
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between border-t border-border pt-2 text-sm font-medium">
                  <span>Outstanding for this batch</span>
                  <span>{formatCurrency(group.outstanding)}</span>
                </div>
              </CardContent>
            </Card>
          ))}

          {groupList.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No orders yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
