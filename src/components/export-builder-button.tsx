'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_DEFS, SIMPLE_PRESET, ALL_COLUMN_IDS } from '@/lib/export-columns';

export function ExportBuilderButton({
  baseParams,
  batchId,
}: {
  baseParams?: URLSearchParams;
  batchId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_COLUMN_IDS));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function download() {
    const params = new URLSearchParams(baseParams?.toString() ?? '');
    params.delete('page');
    if (batchId) params.set('batchId', batchId);
    params.set('columns', [...selected].join(','));
    window.location.href = `/api/export/order-items?${params.toString()}`;
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Download className="h-4 w-4" /> Export
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-border bg-card p-4 sm:w-96">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">Pilih kolom buat di-export</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs text-primary underline underline-offset-2"
            onClick={() => setSelected(new Set(SIMPLE_PRESET))}
          >
            Simple
          </button>
          <button
            type="button"
            className="text-xs text-primary underline underline-offset-2"
            onClick={() => setSelected(new Set(ALL_COLUMN_IDS))}
          >
            Lengkap
          </button>
        </div>
      </div>
      <div className="mb-4 grid max-h-64 grid-cols-2 gap-x-3 gap-y-1.5 overflow-y-auto">
        {COLUMN_DEFS.map((col) => (
          <label key={col.id} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={selected.has(col.id)}
              onChange={() => toggle(col.id)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            {col.label}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={download} disabled={selected.size === 0}>
          Download ({selected.size} kolom)
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </div>
  );
}
