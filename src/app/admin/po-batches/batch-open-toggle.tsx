'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { togglePoBatchOpen } from './actions';

/** Inline Open/Closed toggle for the batch list — stops the click from
 * bubbling up into the card's own Link so toggling doesn't navigate away. */
export function BatchOpenToggle({ batchId, isOpen }: { batchId: string; isOpen: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await togglePoBatchOpen(batchId, !isOpen);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium align-middle ${
        isOpen ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
      }`}
    >
      {isPending ? '…' : isOpen ? 'Open' : 'Closed'}
    </button>
  );
}
