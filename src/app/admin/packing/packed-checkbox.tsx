'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { togglePacked } from './actions';

export function PackedCheckbox({ itemId, initialChecked }: { itemId: string; initialChecked: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={initialChecked}
      disabled={isPending}
      className="h-4 w-4 shrink-0 rounded border-input"
      onChange={(e) => {
        const checked = e.target.checked;
        startTransition(async () => {
          await togglePacked(itemId, checked);
          router.refresh();
        });
      }}
    />
  );
}
