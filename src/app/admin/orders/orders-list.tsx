'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DeleteButton } from '@/components/delete-button';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/status-badges';
import { formatCurrency, formatDate } from '@/lib/utils';
import { orderTypeLabels } from '@/lib/validations';
import { deleteOrder, bulkAssignOrdersToBatch } from './actions';

const PO_TYPES = ['PO_REGULAR', 'PO_REMAINDER'];

type OrderRow = {
  id: string;
  orderNumber: string;
  orderType: string;
  poMonth: string | null;
  etaMonth: string | null;
  status: string;
  paymentStatus: string;
  totalAmount: unknown;
  expectedArrivalDate: Date | null;
  customer: { name: string; phone: string };
  supplier: { name: string } | null;
  items: { bookTitle: string; quantity: number }[];
  invoices: { id: string; sentAt: Date | null }[];
};

function invoiceStatusOf(o: OrderRow): { label: string; className: string } {
  if (o.invoices.length === 0) return { label: 'Belum invoice', className: 'bg-muted text-muted-foreground' };
  if (o.invoices.some((i) => i.sentAt)) return { label: 'Terkirim', className: 'bg-success/15 text-success' };
  return { label: 'Dibuat', className: 'bg-amber-100 text-amber-800' };
}

export function OrdersList({
  orders,
  poBatches,
}: {
  orders: OrderRow[];
  poBatches: { id: string; name: string; type: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [existingBatchId, setExistingBatchId] = useState('');
  const [newBatchName, setNewBatchName] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedOrders = orders.filter((o) => selected.has(o.id));
  // All selected orders must share one order type to pick/create a batch for them.
  const selectedTypes = new Set(selectedOrders.map((o) => o.orderType));
  const uniformType = selectedTypes.size === 1 ? [...selectedTypes][0] : null;
  const isPoType = uniformType ? PO_TYPES.includes(uniformType) : false;
  const batchOptions = poBatches.filter((b) => b.type === uniformType);

  function handleAssign() {
    setError(null);
    startTransition(async () => {
      const result = await bulkAssignOrdersToBatch([...selected], {
        existingBatchId: existingBatchId || undefined,
        newBatchName: !existingBatchId ? newBatchName : undefined,
        orderType: uniformType ?? undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      setAssigning(false);
      setExistingBatchId('');
      setNewBatchName('');
      router.refresh();
    });
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-14 z-10 mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 md:top-0">
          {!assigning ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{selected.size} order dipilih</p>
              <div className="flex gap-2">
                {isPoType ? (
                  <Button size="sm" onClick={() => setAssigning(true)}>
                    Masukkan ke PO Batch
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {uniformType ? 'Cuma order PO reguler/remainder yang bisa masuk batch.' : 'Pilih order dengan type yang sama.'}
                  </p>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Masukkan {selected.size} order ke PO Batch mana?</p>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={existingBatchId}
                  onChange={(e) => {
                    setExistingBatchId(e.target.value);
                    if (e.target.value) setNewBatchName('');
                  }}
                  className="w-56"
                >
                  <option value="">— Batch baru —</option>
                  {batchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
                {!existingBatchId && (
                  <Input
                    placeholder="Nama batch baru"
                    value={newBatchName}
                    onChange={(e) => setNewBatchName(e.target.value)}
                    className="w-56"
                  />
                )}
                <Button size="sm" disabled={isPending} onClick={handleAssign}>
                  {isPending ? 'Menyimpan…' : 'Simpan'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAssigning(false)}>
                  Batal
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </div>
      )}

      <div className="divide-y divide-border md:hidden">
        {orders.map((o) => {
          const inv = invoiceStatusOf(o);
          return (
            <div key={o.id} className="flex gap-3 p-4 hover:bg-secondary/50">
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                onChange={() => toggle(o.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-input"
              />
              <Link href={`/admin/orders/${o.id}`} className="min-w-0 flex-1">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {o.customer.name}
                      <span className="ml-1 font-normal text-muted-foreground">···{o.customer.phone.slice(-4)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{o.orderNumber}</p>
                  </div>
                  <p className="text-sm font-medium">{formatCurrency((o.totalAmount as any).toString())}</p>
                </div>
                <ul className="mb-1 text-xs text-foreground">
                  {o.items.map((it, idx) => (
                    <li key={idx}>
                      {it.bookTitle}
                      {it.quantity > 1 ? ` ×${it.quantity}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {[
                    orderTypeLabels[o.orderType] ?? o.orderType,
                    o.supplier?.name,
                    o.poMonth ? `PO ${o.poMonth}${o.etaMonth ? ` · ETA ${o.etaMonth}` : ''}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <PaymentStatusBadge status={o.paymentStatus} />
                  <OrderStatusBadge status={o.status} />
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${inv.className}`}>
                    {inv.label}
                  </span>
                </div>
              </Link>
            </div>
          );
        })}
        {orders.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No orders found.</p>
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-4 py-3"></th>
              <th className="px-4 py-3 font-medium">Order #</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Books</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">PO / ETA</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((o) => {
              const inv = invoiceStatusOf(o);
              return (
                <tr key={o.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggle(o.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium text-primary hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div>{o.customer.name}</div>
                    <div className="text-xs text-muted-foreground">···{o.customer.phone.slice(-4)}</div>
                  </td>
                  <td className="px-4 py-3 max-w-[240px] text-muted-foreground">
                    <ul>
                      {o.items.map((it, idx) => (
                        <li key={idx}>
                          {it.bookTitle}
                          {it.quantity > 1 ? ` ×${it.quantity}` : ''}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{orderTypeLabels[o.orderType] ?? o.orderType}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.supplier?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {o.poMonth ? (
                      <span>
                        PO {o.poMonth}
                        {o.etaMonth ? ` · ETA ${o.etaMonth}` : ''}
                      </span>
                    ) : (
                      formatDate(o.expectedArrivalDate)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={o.paymentStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${inv.className}`}>
                      {inv.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency((o.totalAmount as any).toString())}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <DeleteButton
                        action={deleteOrder.bind(null, o.id)}
                        confirmMessage={`Delete order ${o.orderNumber}? If it has payments/invoices on record, it'll be cancelled instead — otherwise it's removed permanently.`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
