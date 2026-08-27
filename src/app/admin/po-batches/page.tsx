import Link from 'next/link';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  FAST: 'Fast PO (4–8 weeks)',
  REGULAR: 'PO Reg (4–5 months)',
  READY_STOCK: 'Ready Stock',
};

export default async function PoBatchesPage() {
  const batches = await prisma.purchaseBatch.findMany({
    orderBy: { batchDate: 'desc' },
    include: { _count: { select: { orders: true } } },
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

      <div className="space-y-2">
        {batches.map((b) => (
          <Link key={b.id} href={`/admin/po-batches/${b.id}`}>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{b.name}</p>
                <p className="text-sm text-muted-foreground">{b._count.orders} order(s)</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {TYPE_LABELS[b.type]} · Opened {formatDate(b.batchDate)}
                {b.expectedArrivalDate ? ` · Expected ${formatDate(b.expectedArrivalDate)}` : ''}
              </p>
            </Card>
          </Link>
        ))}
        {batches.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No PO batches yet. Create one to group orders and generate invoices in bulk.
          </p>
        )}
      </div>
    </div>
  );
}
