'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { generateInvoicesForBatch, type GenerateInvoicesResult } from './actions';

export function GenerateInvoicesButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<GenerateInvoicesResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await generateInvoicesForBatch(batchId);
      setResult(res);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={isPending} className="w-full sm:w-auto">
        {isPending ? 'Generating…' : 'Generate invoices for all orders in this batch'}
      </Button>
      {result && (
        <div className="text-sm">
          <p className="font-medium">
            {result.created} invoice(s) created, {result.skipped} skipped.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
