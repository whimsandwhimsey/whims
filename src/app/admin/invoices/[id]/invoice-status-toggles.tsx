'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Send } from 'lucide-react';
import { markInvoicePaid, markInvoiceSent } from '../actions';

export function InvoiceStatusToggles({
  invoiceId,
  paid,
  sent,
}: {
  invoiceId: string;
  paid: boolean;
  sent: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function togglePaid() {
    startTransition(async () => {
      await markInvoicePaid(invoiceId, !paid);
      router.refresh();
    });
  }

  function toggleSent() {
    startTransition(async () => {
      await markInvoiceSent(invoiceId, !sent);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-md gap-2 print:hidden">
      <button
        type="button"
        onClick={togglePaid}
        disabled={isPending}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
          paid
            ? 'border-success/40 bg-success/10 text-success'
            : 'border-border bg-secondary text-muted-foreground'
        }`}
      >
        <Check className="h-4 w-4" /> {paid ? 'Paid' : 'Mark as paid'}
      </button>
      <button
        type="button"
        onClick={toggleSent}
        disabled={isPending}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
          sent
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-secondary text-muted-foreground'
        }`}
      >
        <Send className="h-4 w-4" /> {sent ? 'Sent' : 'Not sent yet'}
      </button>
    </div>
  );
}
