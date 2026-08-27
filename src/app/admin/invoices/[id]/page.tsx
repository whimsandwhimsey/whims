import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { InvoiceDocument, type InvoiceDocumentData } from '@/components/invoice-document';
import { InvoiceActions } from '@/components/invoice-actions';
import { DeleteButton } from '@/components/delete-button';
import { PaymentStatusBadge } from '@/components/status-badges';
import { deleteInvoice } from '../actions';
import { InvoiceStatusToggles } from './invoice-status-toggles';
import { formatCurrency } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';

export default async function AdminInvoiceDetailPage({ params }: { params: { id: string } }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      order: { include: { customer: true, items: true } },
    },
  });
  if (!invoice) notFound();

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
    <div className="p-4 sm:p-6">
      <div className="mx-auto mb-4 flex max-w-md items-center justify-between print:hidden">
        <Link
          href={`/admin/orders/${invoice.orderId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to order
        </Link>
        <DeleteButton
          action={deleteInvoice.bind(null, invoice.id)}
          confirmMessage={`Delete invoice ${invoice.invoiceNumber}?`}
          label="Delete"
        />
      </div>

      <div className="mx-auto mb-4 max-w-md rounded-md border border-border p-3 print:hidden">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">This invoice</span>
          <PaymentStatusBadge status={invoice.paymentStatus} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Amount</span>
          <span>{formatCurrency(toNumber(invoice.amount))}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Paid so far</span>
          <span>{formatCurrency(toNumber(invoice.amountPaid))}</span>
        </div>
        <div className="flex justify-between text-sm font-medium">
          <span>Outstanding</span>
          <span>{formatCurrency(toNumber(invoice.outstandingBalance))}</span>
        </div>
      </div>

      <div className="mx-auto mb-4 max-w-md">
        <InvoiceStatusToggles invoiceId={invoice.id} sent={!!invoice.sentAt} />
      </div>

      <div id="invoice-print-area" className="mb-4">
        <InvoiceDocument data={data} id="invoice-capture-target" />
      </div>

      <InvoiceActions
        data={data}
        targetElementId="invoice-capture-target"
        whatsappPhone={invoice.order.customer.phone}
        invoiceId={invoice.id}
      />
    </div>
  );
}
