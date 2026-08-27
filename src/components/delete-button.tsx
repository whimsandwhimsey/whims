'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DeleteButton({
  action,
  confirmMessage = 'Are you sure? This cannot be undone.',
  label,
}: {
  action: () => Promise<void>;
  confirmMessage?: string;
  label?: string;
}) {
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
