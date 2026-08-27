import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentStatusBadge } from '@/components/status-badges';
import { DeleteButton } from '@/components/delete-button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';
import { getCustomerDepositBalance } from '@/lib/deposit';
import { StatusChanger } from '../status-changer';
import { deleteOrder } from '../actions';
import { InvoicePaymentActions } from './invoice-payment-actions';
import { CreateInvoiceForm } from './create-invoice-form';
import { bookFormatLabels } from '@/lib/validations';

const INVOICE_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Deposit',
  FINAL_PAYMENT: 'Final Payment',
  READY_STOCK: 'Ready Stock',
};

const BATCH_TYPE_LABELS: Record<string, string> = {
  FAST: 'Fast PO',
  REGULAR: 'PO Reg',
  READY_STOCK: 'Ready Stock',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  READY_STOCK: 'Ready stock',
  EVENT_JASTIP: 'Event / jastip',
  PO_REGULAR: 'PO reguler',
  PO_REMAINDER: 'PO remainder',
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { merged?: string };
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      items: true,
      payments: { orderBy: { date: 'desc' } },
      invoices: { orderBy: { issuedAt: 'desc' } },
      poBatch: true,
      supplier: true,
    },
  });
  if (!order) notFound();

  const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const depositBalance = await getCustomerDepositBalance(order.customerId);
  const outstanding = toNumber(order.outstandingBalance);

  return (
    <div className="p-6">
      {searchParams.merged === '1' && (
        <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">
          These items were added to this existing order — same customer, PO month, order type,
          and supplier as before, so they merged into one invoice instead of a new order.
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/orders/${order.id}/edit`}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </Button>
          <DeleteButton
            action={deleteOrder.bind(null, order.id)}
            confirmMessage={`Delete order ${order.orderNumber}? If it has payments/invoices on record, it'll be cancelled instead (kept for your records) — otherwise it's removed permanently.`}
            label="Delete"
          />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {order.customer.name} · {order.customer.phone}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
              {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
            </span>
            {order.eventName && <span className="text-muted-foreground">{order.eventName}</span>}
            {order.poMonth && <span className="text-muted-foreground">PO {order.poMonth}</span>}
            {order.etaMonth && <span className="text-muted-foreground">ETA {order.etaMonth}</span>}
            {order.supplier && <span className="text-muted-foreground">{order.supplier.name}</span>}
          </div>
          {order.poBatch && (
            <Link
              href={`/admin/po-batches/${order.poBatch.id}`}
              className="mt-1 inline-block text-xs text-brass underline underline-offset-2"
            >
              {order.poBatch.name} ({BATCH_TYPE_LABELS[order.poBatch.type] ?? order.poBatch.type})
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <PaymentStatusBadge status={order.paymentStatus} />
          <StatusChanger orderId={order.id} current={order.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Book items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Title</th>
                    <th className="px-4 py-2 font-medium text-right">Qty</th>
                    <th className="px-4 py-2 font-medium text-right">Price</th>
                    <th className="px-4 py-2 font-medium text-right">Discount</th>
                    <th className="px-4 py-2 font-medium text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2">
                        <p>{item.bookTitle}</p>
                        {(item.isbn || item.format) && (
                          <p className="text-xs text-muted-foreground">
                            {[item.format ? bookFormatLabels[item.format] ?? item.format : null, item.isbn].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{item.quantity}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.sellingPrice.toString())}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.discount.toString())}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatCurrency(item.subtotal.toString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Invoices</CardTitle>
              <CreateInvoiceForm
                orderId={order.id}
                orderType={order.orderType}
                totalAmount={toNumber(order.totalAmount)}
                totalQuantity={totalQuantity}
                dpType={order.dpType}
                dpValue={order.dpValue ? toNumber(order.dpValue) : null}
                alreadyInvoiced={order.invoices.reduce((sum, inv) => sum + toNumber(inv.amount), 0)}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {order.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices issued yet.</p>
              ) : (
                <div className="space-y-3">
                  {order.invoices.map((inv) => (
                    <div key={inv.id} className="rounded-md border border-border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Link
                          href={`/admin/invoices/${inv.id}`}
                          className="text-sm font-medium hover:text-primary hover:underline"
                        >
                          {inv.invoiceNumber} · {INVOICE_TYPE_LABELS[inv.type] ?? inv.type}
                        </Link>
                        <div className="flex items-center gap-1.5">
                          <PaymentStatusBadge status={inv.paymentStatus} />
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              inv.sentAt ? 'bg-primary/15 text-primary' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {inv.sentAt ? 'Sent' : 'Not sent'}
                          </span>
                        </div>
                      </div>
                      <div className="mb-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div>
                          Amount
                          <p className="text-sm font-medium text-foreground">
                            {formatCurrency(inv.amount.toString())}
                          </p>
                        </div>
                        <div>
                          Paid
                          <p className="text-sm font-medium text-foreground">
                            {formatCurrency(inv.amountPaid.toString())}
                          </p>
                        </div>
                        <div>
                          Outstanding
                          <p className="text-sm font-medium text-foreground">
                            {formatCurrency(inv.outstandingBalance.toString())}
                          </p>
                        </div>
                      </div>
                      <InvoicePaymentActions
                        invoiceId={inv.id}
                        outstanding={toNumber(inv.outstandingBalance)}
                        depositBalance={depositBalance}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
            </CardHeader>
            <CardContent>
              {order.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {order.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>
                        {formatDate(p.date)} · {p.method === 'BANK_TRANSFER' ? 'Bank Transfer' : 'QRIS'}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{formatCurrency(p.amount.toString())}</span>
                        <Link
                          href={`/admin/payments/${p.id}/edit?returnTo=/admin/orders/${order.id}`}
                          className="text-xs text-primary underline underline-offset-2"
                        >
                          Edit
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{order.notes}</CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={formatCurrency(order.subtotal.toString())} />
              <Row label="Discount" value={`- ${formatCurrency(order.discountTotal.toString())}`} />
              <Row label="Total" value={formatCurrency(order.totalAmount.toString())} bold />
              <Row label="Paid" value={formatCurrency(order.amountPaid.toString())} />
              <Row
                label="Outstanding"
                value={formatCurrency(order.outstandingBalance.toString())}
                highlight={toNumber(order.outstandingBalance) > 0}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Order date" value={formatDate(order.orderDate)} />
              <Row label="Expected arrival" value={formatDate(order.expectedArrivalDate)} />
              <Row label="Actual arrival" value={formatDate(order.actualArrivalDate)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  highlight,
  success,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
  success?: boolean;
}) {
  return (
    <div className={bold ? 'flex justify-between font-semibold' : 'flex justify-between'}>
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span
        className={
          highlight
            ? 'font-medium text-destructive'
            : success
              ? 'font-medium text-success'
              : muted
                ? 'text-muted-foreground'
                : ''
        }
      >
        {value}
      </span>
    </div>
  );
}
