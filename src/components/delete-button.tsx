'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DeleteButton({
  action,
  confirmMessage = 'Are you sure? This cannot be undone.',
  label,
  redirectTo,
}: {
  action: () => Promise<void>;
  confirmMessage?: string;
  label?: string;
  /** Where to navigate after a successful delete — use this whenever the
   * delete button lives on the detail page of the thing being deleted,
   * otherwise the user is left staring at a 404 for a page that no longer
   * exists. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm(confirmMessage)) return;
        startTransition(async () => {
          try {
            await action();
            if (redirectTo) router.push(redirectTo);
          } catch (err) {
            alert(err instanceof Error ? err.message : 'Something went wrong.');
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
      {label}
    </Button>
  );
}
