import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { InvoiceDocument, type InvoiceDocumentData } from '@/components/invoice-document';
import { InvoiceActions } from '@/components/invoice-actions';
import { PayInvoiceForm } from './pay-invoice-form';
import { toNumber } from '@/lib/calculations';

export default async function PortalInvoiceDetailPage({ params }: { params: { id: string } }) {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      order: { include: { customer: true, items: true } },
      paymentRequests: { where: { status: 'PENDING' }, select: { id: true } },
    },
  });

  // A customer may only ever view their own invoices.
  if (!invoice || invoice.order.customerId !== customerId) notFound();

  const data: InvoiceDocumentData = {
    invoiceNumber: invoice.invoiceNumber,
    type: invoice.type,
    amount: toNumber(invoice.amount),
    issuedAt: invoice.issuedAt,
    order: {
      orderNumber: invoice.order.orderNumber,
      orderDate: invoice.order.orderDate,
      totalAmount: toNumber(invoice.order.totalAmount),
      amountPaid: toNumber(invoice.order.amountPaid),
      outstandingBalance: toNumber(invoice.order.outstandingBalance),
      items: invoice.order.items.map((i) => ({
        bookTitle: i.bookTitle,
        quantity: i.quantity,
        sellingPrice: toNumber(i.sellingPrice),
        subtotal: toNumber(i.subtotal),
      })),
    },
    customer: {
      name: invoice.order.customer.name,
      phone: invoice.order.customer.phone,
      address: invoice.order.customer.address,
    },
  };

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto mb-4 max-w-md print:hidden">
        <Link
          href={`/portal/orders/${invoice.orderId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to order
        </Link>
      </div>

      <div id="invoice-print-area" className="mb-4">
        <InvoiceDocument data={data} id="invoice-capture-target" />
      </div>

      <InvoiceActions data={data} targetElementId="invoice-capture-target" />

      <div className="mx-auto mt-4 max-w-md">
        <PayInvoiceForm
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          outstanding={toNumber(invoice.outstandingBalance)}
          hasPendingRequest={invoice.paymentRequests.length > 0}
        />
      </div>
    </main>
  );
}
