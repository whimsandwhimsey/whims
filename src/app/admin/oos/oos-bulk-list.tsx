'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { bulkMarkOos } from './actions';
import { resolveItemOos } from '../orders/[id]/oos-actions';

export function MarkAllCard({
  bookId,
  batchId,
  bookTitle,
  count,
}: {
  bookId: string;
  batchId: string;
  bookTitle: string;
  count: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <strong>{count} order</strong> di batch ini belum diproses untuk &quot;{bookTitle}&quot;.
        </p>
        <Button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await fetch(`/api/oos/candidates?bookId=${bookId}&batchId=${batchId}`);
              const data = await res.json();
              const ids: string[] = data.ids ?? [];
              if (ids.length > 0) {
                await bulkMarkOos(ids, bookTitle);
              }
              router.refresh();
            })
          }
        >
          {isPending ? 'Menandai…' : `Tandai OOS untuk ${count} order`}
        </Button>
      </CardContent>
    </Card>
  );
}

type Item = {
  id: string;
  bookTitle: string;
  quantity: number;
  subtotalNumber: number;
  isOos: boolean;
  oosResolution: string | null;
  order: { id: string; orderNumber: string };
  customer: { id: string; name: string; phone: string };
};

export function ResolveList({ items, bookTitle }: { items: Item[]; bookTitle: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        {items.filter((i) => !i.oosResolution).length} customer perlu diselesaikan (refund/deposit):
      </p>
      {items.map((item) => (
        <ResolveRow key={item.id} item={item} bookTitle={bookTitle} />
      ))}
    </div>
  );
}

function ResolveRow({ item, bookTitle }: { item: Item; bookTitle: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [choice, setChoice] = useState<'REFUND' | 'DEPOSIT'>('DEPOSIT');

  const waMessage = encodeURIComponent(
    `Halo ${item.customer.name}, mohon maaf buku "${bookTitle}" yang kamu pesan (order ${item.order.orderNumber}) ternyata out of stock dari supplier kami. Mau kami refund sebesar ${formatCurrency(item.subtotalNumber)}, atau dijadikan deposit buat order berikutnya?`
  );
  const waPhone = item.customer.phone.replace(/[^0-9]/g, '');
  const waLink = `https://wa.me/${waPhone}?text=${waMessage}`;

  if (item.oosResolution) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between p-3 text-sm">
          <div>
            <Link href={`/admin/orders/${item.order.id}`} className="font-medium hover:text-primary hover:underline">
              {item.customer.name}
            </Link>
            <p className="text-xs text-muted-foreground">
              {item.order.orderNumber} · {formatCurrency(item.subtotalNumber)}
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
            {item.oosResolution === 'DEPOSIT' ? 'Jadi deposit' : 'Refund'}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div>
            <Link href={`/admin/orders/${item.order.id}`} className="text-sm font-medium hover:text-primary hover:underline">
              {item.customer.name}
            </Link>
            <p className="text-xs text-muted-foreground">
              {item.order.orderNumber} · {formatCurrency(item.subtotalNumber)}
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="h-auto px-2 py-1 text-xs">
            <a href={waLink} target="_blank" rel="noopener noreferrer">
              Kabari via WA
            </a>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={choice}
            onChange={(e) => setChoice(e.target.value as 'REFUND' | 'DEPOSIT')}
            className="h-8 flex-1 text-xs"
          >
            <option value="DEPOSIT">Jadi deposit</option>
            <option value="REFUND">Refund</option>
          </Select>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await resolveItemOos(item.id, choice);
                router.refresh();
              })
            }
          >
            {isPending ? '…' : 'Konfirmasi'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
