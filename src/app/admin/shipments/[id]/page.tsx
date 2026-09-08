import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';
import { getTrackingStatus } from '@/lib/biteship';
import { ShipmentPaymentForm } from './shipment-payment-form';
import { BillShippingWhatsAppButton } from './bill-whatsapp-button';

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

export default async function ShipmentDetailPage({ params }: { params: { id: string } }) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      payments: { orderBy: { date: 'desc' } },
      orders: { include: { items: true, poBatch: { select: { name: true } } } },
    },
  });
  if (!shipment) notFound();

  const tracking = await getTrackingStatus(shipment.trackingNumber, shipment.courier);

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/admin/shipments"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to shipments
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">{shipment.customer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {COURIER_LABELS[shipment.courier] ?? shipment.courier} · {shipment.trackingNumber}
          </p>
        </div>
        <PaymentStatusBadge status={shipment.paymentStatus} />
      </div>

      {tracking && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Status pengiriman (live dari Biteship)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm font-medium capitalize">{tracking.status.replace(/_/g, ' ')}</p>
            {tracking.history.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {tracking.history.slice(0, 5).map((h, i) => (
                  <li key={i}>
                    {formatDate(h.updatedAt)} — {h.note}
                  </li>
                ))}
              </ul>
            )}
            {tracking.link && (
              <a
                href={tracking.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
              >
                Lacak di situs kurir <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Ongkir</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Ongkir</p>
              <p className="font-medium">{formatCurrency(shipment.shippingCost.toString())}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sudah dibayar</p>
              <p className="font-medium">{formatCurrency(shipment.amountPaid.toString())}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="font-medium">{formatCurrency(shipment.outstandingBalance.toString())}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <BillShippingWhatsAppButton
              customerName={shipment.customer.name}
              customerPhone={shipment.customer.phone}
              trackingNumber={shipment.trackingNumber}
              shippingCost={toNumber(shipment.shippingCost)}
            />
            <ShipmentPaymentForm shipmentId={shipment.id} outstanding={toNumber(shipment.outstandingBalance)} />
          </div>
          {shipment.payments.length > 0 && (
            <ul className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
              {shipment.payments.map((p) => (
                <li key={p.id}>
                  {formatDate(p.date)} — {formatCurrency(p.amount.toString())} ({p.method === 'QRIS' ? 'QRIS' : 'Transfer'})
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Isi paket ({shipment.orders.length} order)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {shipment.orders.map((order) => (
            <div key={order.id} className="rounded-md border border-border p-3">
              <div className="mb-1 flex items-center justify-between">
                <Link href={`/admin/orders/${order.id}`} className="text-sm font-medium hover:text-primary hover:underline">
                  {order.orderNumber}
                </Link>
                {order.poBatch && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    {order.poBatch.name}
                  </span>
                )}
              </div>
              <ul className="text-xs text-muted-foreground">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.bookTitle} × {item.quantity}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
