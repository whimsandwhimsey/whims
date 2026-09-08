import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate } from '@/lib/utils';

const COURIER_LABELS: Record<string, string> = {
  LION: 'Lion Parcel',
  OJEK: 'Ojek (Gojek/Grab)',
  SHOPEE: 'Shopee Express',
  JNE: 'JNE',
  JNT: 'J&T Express',
  SICEPAT: 'SiCepat',
  ANTERAJA: 'AnterAja',
  WAHANA: 'Wahana',
  NINJA: 'Ninja Xpress',
  IDEXPRESS: 'ID Express',
};

function toNumberSafe(v: unknown): number {
  return Number((v as { toString: () => string })?.toString() ?? 0);
}

export default async function ShipmentsPage() {
  const shipments = await prisma.shipment.findMany({
    orderBy: { createdAt: 'desc' },
    include: { customer: true, orders: { select: { id: true } } },
  });

  return (
    <div className="p-4 sm:p-6">
      <h1 className="font-display mb-1 text-2xl font-semibold text-primary">Shipments</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Semua resi yang udah dibuat dari Packing List, plus status bayar ongkirnya.
      </p>

      <div className="space-y-2">
        {shipments.map((s) => (
          <Link key={s.id} href={`/admin/shipments/${s.id}`}>
            <Card className="p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-medium">{s.customer.name}</p>
                <PaymentStatusBadge status={s.paymentStatus} />
              </div>
              <p className="text-xs text-muted-foreground">
                {COURIER_LABELS[s.courier] ?? s.courier} · {s.trackingNumber} · {s.orders.length} order(s) ·{' '}
                {formatDate(s.createdAt)}
              </p>
              <p className="mt-1 text-sm font-medium">
                Ongkir {formatCurrency(s.shippingCost.toString())}
                {toNumberSafe(s.outstandingBalance) > 0 && (
                  <span className="ml-2 text-xs font-normal text-destructive">
                    Outstanding {formatCurrency(s.outstandingBalance.toString())}
                  </span>
                )}
              </p>
            </Card>
          </Link>
        ))}
        {shipments.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Belum ada shipment — bikin dari Packing List pas ngisi resi.
          </p>
        )}
      </div>
    </div>
  );
}
