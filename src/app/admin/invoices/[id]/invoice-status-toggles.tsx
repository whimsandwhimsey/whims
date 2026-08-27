'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { markInvoiceSent } from '../actions';

export function InvoiceStatusToggles({
  invoiceId,
  sent,
}: {
  invoiceId: string;
  sent: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggleSent() {
    startTransition(async () => {
      await markInvoiceSent(invoiceId, !sent);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-md print:hidden">
      <button
        type="button"
        onClick={toggleSent}
        disabled={isPending}
        className={`flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
          sent
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-secondary text-muted-foreground'
        }`}
      >
        <Send className="h-4 w-4" /> {sent ? 'Sent' : 'Not sent yet'}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Payment status updates automatically once a payment is recorded against this invoice —
        it&apos;s not a manual toggle anymore.
      </p>
    </div>
  );
}
