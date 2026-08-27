import { formatCurrency, formatDate } from '@/lib/utils';

export type InvoiceDocumentData = {
  invoiceNumber: string;
  type: 'DEPOSIT' | 'FINAL_PAYMENT' | 'READY_STOCK';
  amount: number;
  issuedAt: Date | string;
  order: {
    orderNumber: string;
    orderDate: Date | string;
    totalAmount: number;
    amountPaid: number;
    outstandingBalance: number;
    items: { bookTitle: string; quantity: number; sellingPrice: number; subtotal: number }[];
  };
  customer: {
    name: string;
    phone: string;
    address: string | null;
  };
};

const TYPE_LABELS: Record<InvoiceDocumentData['type'], string> = {
  DEPOSIT: 'Deposit Invoice',
  FINAL_PAYMENT: 'Final Payment Invoice',
  READY_STOCK: 'Ready Stock Invoice',
};

// Invoice types where the customer is about to be shipped something —
// worth a visible callout to double-check the address before packing.
const ADDRESS_CONFIRM_TYPES: InvoiceDocumentData['type'][] = ['FINAL_PAYMENT', 'READY_STOCK'];

/**
 * Pure, self-contained visual — no nav, no buttons — so it works identically
 * whether it's on-screen, printed (window.print), or captured as an image
 * (html2canvas). Fixed max-width so it reads well both on a phone screen and
 * as an exported image, rather than stretching full-bleed.
 *
 * Uses a plain <img> (not next/image) for the logo — keeps html2canvas
 * capture simple and avoids any dependency on Next's image optimization
 * endpoint being available at capture time.
 */
export function InvoiceDocument({ data, id }: { data: InvoiceDocumentData; id?: string }) {
  const showAddressConfirm = ADDRESS_CONFIRM_TYPES.includes(data.type) && data.customer.address;

  return (
    <div
      id={id}
      className="mx-auto w-full max-w-md rounded-xl border border-border bg-white p-5 text-sm text-foreground sm:p-8"
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Whims & Whimsey" className="h-10 w-auto" />
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {TYPE_LABELS[data.type]}
          </p>
          <p className="text-xs font-medium text-muted-foreground">{data.invoiceNumber}</p>
          <p className="text-[10px] text-muted-foreground">{formatDate(data.issuedAt)}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Bill to</p>
          <p className="font-medium">{data.customer.name}</p>
          <p className="text-xs text-muted-foreground">{data.customer.phone}</p>
          {data.customer.address && (
            <p className="text-xs text-muted-foreground">{data.customer.address}</p>
          )}
        </div>
        <div className="text-right">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Order</p>
          <p className="font-medium">{data.order.orderNumber}</p>
          <p className="text-xs text-muted-foreground">{formatDate(data.order.orderDate)}</p>
        </div>
      </div>

      {showAddressConfirm && (
        <div className="mb-6 rounded-md border border-brass/40 bg-brass/5 p-3">
          <p className="text-xs font-medium text-brass">Please confirm your delivery address:</p>
          <p className="text-sm">{data.customer.address}</p>
        </div>
      )}

      <table className="mb-6 w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {data.order.items.map((item, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="py-2 pr-2">{item.bookTitle}</td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right">{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 space-y-1.5 text-sm">
        <Row label="Order total" value={formatCurrency(data.order.totalAmount)} />
        <Row label="Paid so far" value={formatCurrency(data.order.amountPaid)} />
        <Row label="Outstanding" value={formatCurrency(data.order.outstandingBalance)} />
        <div className="my-2 border-t border-border" />
        <Row label={`This invoice (${TYPE_LABELS[data.type]})`} value={formatCurrency(data.amount)} bold />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Thank you for shopping with Whims & Whimsey. Questions about this invoice? Just reply to our
        WhatsApp message.
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={bold ? 'flex justify-between text-base font-semibold' : 'flex justify-between'}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
