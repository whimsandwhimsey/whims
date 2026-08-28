'use client';

import { useRouter } from 'next/navigation';

export function BatchFilterList({
  bookId,
  groups,
  selectedBatchId,
}: {
  bookId: string;
  groups: { batchId: string | null; batchName: string; count: number }[];
  selectedBatchId?: string;
}) {
  const router = useRouter();

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Buku ini ada di batch mana yang OOS?</p>
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const key = g.batchId ?? '__none__';
          const isSelected = selectedBatchId === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => router.push(`/admin/oos?bookId=${bookId}&batchId=${key}`)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/70'
              }`}
            >
              {g.batchName} ({g.count} order)
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Cuma order di batch yang kamu pilih yang bakal ditandai OOS — batch lain buat buku yang
        sama gak ikut kesentuh.
      </p>
    </div>
  );
}
