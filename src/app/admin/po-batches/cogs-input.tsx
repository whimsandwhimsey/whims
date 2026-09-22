'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateBookCogsForBatch } from './actions';

export function CogsInput({
  batchId,
  isbn,
  bookTitle,
  initialCogs,
}: {
  batchId: string;
  isbn: string | null;
  bookTitle: string;
  initialCogs: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(initialCogs || ''));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateBookCogsForBatch(batchId, { isbn, bookTitle }, Number(value) || 0);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min="0"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        className="h-8 w-28 text-xs"
      />
      <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={handleSave} disabled={isPending}>
        {isPending ? '…' : saved ? '✓' : 'Save'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
