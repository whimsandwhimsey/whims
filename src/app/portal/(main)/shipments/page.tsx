import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getAuthSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getTrackingStatus } from '@/lib/biteship';

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

export default async function PortalShipmentsPage() {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const shipments = await prisma.shipment.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    include: { orders: { include: { items: true, poBatch: { select: { name: true } } } } },
  });

  const withTracking = await Promise.all(
    shipments.map(async (s) => ({ shipment: s, tracking: await getTrackingStatus(s.trackingNumber, s.courier) }))
  );

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/portal/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to your orders
        </Link>

        <h1 className="mb-1 font-display text-2xl font-semibold text-primary">Pengiriman</h1>
        <p className="mb-6 text-sm text-muted-foreground">Semua paket kamu, lengkap sama resi dan isinya.</p>

        {withTracking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada paket yang dikirim.</p>
        ) : (
          <div className="space-y-4">
            {withTracking.map(({ shipment, tracking }) => (
              <Card key={shipment.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    {COURIER_LABELS[shipment.courier] ?? shipment.courier} · {shipment.trackingNumber}
                  </CardTitle>
                  <PaymentStatusBadge status={shipment.paymentStatus} />
                </CardHeader>
                <CardContent className="space-y-3">
                  {tracking && (
                    <div className="rounded-md bg-secondary/50 p-2.5">
                      <p className="text-sm font-medium capitalize">{tracking.status.replace(/_/g, ' ')}</p>
                      {tracking.link && (
                        <a
                          href={tracking.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                        >
                          Lacak di situs kurir <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Isi paket ini:</p>
                    <ul className="space-y-0.5 text-sm">
                      {shipment.orders.flatMap((o) =>
                        o.items.map((it) => (
                          <li key={it.id} className="flex items-center justify-between">
                            <span>
                              {it.bookTitle} × {it.quantity}
                            </span>
                            {o.poBatch && (
                              <span className="text-xs text-muted-foreground">{o.poBatch.name}</span>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                    <span className="text-muted-foreground">Ongkir</span>
                    <span className="font-medium">{formatCurrency(shipment.shippingCost.toString())}</span>
                  </div>
                  {Number(shipment.outstandingBalance.toString()) > 0 && (
                    <p className="text-xs text-destructive">
                      Outstanding {formatCurrency(shipment.outstandingBalance.toString())} — admin bakal
                      kirim tagihan via WhatsApp.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Dikirim {formatDate(shipment.createdAt)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
