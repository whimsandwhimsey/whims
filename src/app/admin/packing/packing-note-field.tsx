'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePackingNote } from './actions';

export function PackingNoteField({ customerId, initialNote }: { customerId: string; initialNote: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialNote);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('note', value);
      await savePackingNote(customerId, formData);
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return initialNote ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-left text-xs text-amber-900"
      >
        📝 {initialNote}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        + Tambah catatan (hold, kirim setengah, dll)
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Contoh: hold dulu, tunggu konfirmasi customer"
        className="h-8 min-w-[200px] flex-1 rounded-md border border-input bg-background px-2 text-xs"
        autoFocus
        maxLength={500}
      />
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="rounded-md border border-input bg-secondary px-2 py-1 text-xs"
      >
        {isPending ? '…' : 'Simpan'}
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(initialNote);
          setEditing(false);
        }}
        className="text-xs text-muted-foreground"
      >
        Batal
      </button>
    </div>
  );
}
