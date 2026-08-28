'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { markItemOos, unmarkItemOos, resolveItemOos } from './oos-actions';

export function OosItemActions({
  itemId,
  isOos,
  isResolved,
  resolution,
}: {
  itemId: string;
  isOos: boolean;
  isResolved: boolean;
  resolution: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resolving, setResolving] = useState(false);
  const [choice, setChoice] = useState<'REFUND' | 'DEPOSIT'>('DEPOSIT');
  const [notes, setNotes] = useState('');

  if (isResolved) {
    return (
      <span className="text-xs text-muted-foreground">
        OOS · {resolution === 'DEPOSIT' ? 'Jadi deposit' : 'Refund'}
      </span>
    );
  }

  if (!isOos) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-auto px-2 py-1 text-xs"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await markItemOos(itemId);
            router.refresh();
          })
        }
      >
        Tandai OOS
      </Button>
    );
  }

  if (!resolving) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-amber-700">Belum diresolve</span>
        <Button type="button" size="sm" variant="outline" className="h-auto px-2 py-1 text-xs" onClick={() => setResolving(true)}>
          Resolve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto px-2 py-1 text-xs"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await unmarkItemOos(itemId);
              router.refresh();
            })
          }
        >
          Batal
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-2">
      <Select value={choice} onChange={(e) => setChoice(e.target.value as 'REFUND' | 'DEPOSIT')} className="h-8 text-xs">
        <option value="DEPOSIT">Jadi deposit customer</option>
        <option value="REFUND">Refund (uang keluar, dicatat)</option>
      </Select>
      <Input
        placeholder="Catatan (opsional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="h-8 text-xs"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="h-auto px-2 py-1 text-xs"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await resolveItemOos(itemId, choice, notes);
              router.refresh();
            })
          }
        >
          {isPending ? 'Menyimpan…' : 'Konfirmasi'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-auto px-2 py-1 text-xs" onClick={() => setResolving(false)}>
          Batal
        </Button>
      </div>
    </div>
  );
}
