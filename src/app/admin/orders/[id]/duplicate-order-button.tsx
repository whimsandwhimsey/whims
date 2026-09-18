'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/searchable-select';
import { duplicateOrder } from '../actions';

type Customer = { id: string; name: string; phone: string };

export function DuplicateOrderButton({ orderId, customers }: { orderId: string; customers: Customer[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [singleCustomerId, setSingleCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ createdCount: number; orderIds: string[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.phone }));

  const filteredCustomers =
    query.trim() === ''
      ? customers
      : customers.filter(
          (c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query)
        );

  function toggleCustomer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setSingleCustomerId('');
    setSelectedIds(new Set());
    setQuery('');
    setError(null);
    setResult(null);
  }

  function handleSubmit() {
    setError(null);
    const targetIds = mode === 'single' ? (singleCustomerId ? [singleCustomerId] : []) : [...selectedIds];
    if (targetIds.length === 0) {
      setError('Pilih dulu customer-nya.');
      return;
    }
    startTransition(async () => {
      const res = await duplicateOrder(orderId, targetIds);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setResult({ createdCount: res.createdCount, orderIds: res.orderIds });
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="h-4 w-4" /> Duplicate
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-border bg-card p-4 sm:w-96">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">Duplicate order ini</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {result ? (
        <div className="space-y-2">
          <p className="text-sm text-success">
            {result.createdCount} order baru berhasil dibuat, semua buku & pengaturannya sama persis —
            tinggal cek customer-nya aja.
          </p>
          <ul className="space-y-1 text-xs">
            {result.orderIds.map((id) => (
              <li key={id}>
                <Link href={`/admin/orders/${id}`} className="text-primary underline underline-offset-2">
                  Lihat order →
                </Link>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" onClick={reset}>
            Duplicate lagi
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-1 rounded-md bg-secondary p-1">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                mode === 'single' ? 'bg-card shadow-sm' : 'text-muted-foreground'
              }`}
            >
              1 customer
            </button>
            <button
              type="button"
              onClick={() => setMode('multi')}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                mode === 'multi' ? 'bg-card shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Banyak customer
            </button>
          </div>

          {mode === 'single' ? (
            <SearchableSelect
              options={customerOptions}
              value={singleCustomerId}
              onChange={setSingleCustomerId}
              placeholder="Pilih customer…"
            />
          ) : (
            <div>
              <Input
                type="text"
                placeholder="Cari nama / nomor HP…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mb-2"
              />
              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                {filteredCustomers.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">Gak ketemu.</p>
                )}
                {filteredCustomers.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-secondary"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleCustomer(c.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>
                      {c.name} <span className="text-xs text-muted-foreground">{c.phone}</span>
                    </span>
                  </label>
                ))}
              </div>
              {selectedIds.size > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{selectedIds.size} customer dipilih</p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? 'Membuat…' : 'Buat duplikat'}
          </Button>
        </div>
      )}
    </div>
  );
}
