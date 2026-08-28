import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/calculations';
import { BookSearchForm } from './book-search-form';
import { BatchFilterList } from './batch-filter-list';
import { MarkAllCard, ResolveList } from './oos-bulk-list';

export default async function BulkOosPage({
  searchParams,
}: {
  searchParams: { bookId?: string; batchId?: string };
}) {
  const books = await prisma.book.findMany({
    where: { isActive: true },
    orderBy: { title: 'asc' },
    select: { id: true, title: true, isbn: true },
  });

  const bookId = searchParams.bookId;
  const batchId = searchParams.batchId;
  let selectedBook: { id: string; title: string } | null = null;
  let batchGroups: { batchId: string | null; batchName: string; count: number }[] = [];
  let unmarkedCount = 0;
  let markedItems: {
    id: string;
    bookTitle: string;
    quantity: number;
    subtotal: string;
    isOos: boolean;
    oosResolution: string | null;
    order: { id: string; orderNumber: string };
    customer: { id: string; name: string; phone: string };
  }[] = [];

  if (bookId) {
    selectedBook = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, title: true } });

    const OPEN_STATUSES = ['WAITING', 'IN_TRANSIT', 'ARRIVED_COUNTRY', 'ARRIVED'] as const;
    const allItems = await prisma.orderItem.findMany({
      where: { bookId, order: { status: { in: [...OPEN_STATUSES] as any } } },
      include: { order: { include: { customer: true, poBatch: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Same book can appear in several PO batches (different shipments) —
    // OOS in one doesn't imply OOS in another, so group by batch first and
    // require picking which batch(es) actually came up short.
    const groupMap = new Map<string, { batchId: string | null; batchName: string; count: number }>();
    for (const item of allItems) {
      if (item.isOos) continue;
      const key = item.order.poBatchId ?? '__none__';
      const existing = groupMap.get(key);
      if (existing) existing.count++;
      else
        groupMap.set(key, {
          batchId: item.order.poBatchId,
          batchName: item.order.poBatch?.name ?? '(Tanpa PO batch)',
          count: 1,
        });
    }
    batchGroups = Array.from(groupMap.values());

    const items = batchId
      ? allItems.filter((i) => (i.order.poBatchId ?? '__none__') === batchId)
      : [];

    unmarkedCount = items.filter((i) => !i.isOos).length;
    markedItems = allItems
      .filter((i) => i.isOos)
      .map((i) => ({
        id: i.id,
        bookTitle: i.bookTitle,
        quantity: i.quantity,
        subtotal: i.subtotal.toString(),
        isOos: i.isOos,
        oosResolution: i.oosResolution,
        order: { id: i.order.id, orderNumber: i.order.orderNumber },
        customer: { id: i.order.customer.id, name: i.order.customer.name, phone: i.order.customer.phone },
      }));
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="font-display mb-1 text-2xl font-semibold text-primary">Tandai buku OOS</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Cari buku, pilih PO batch yang kena OOS-nya (buku yang sama bisa aja OK di batch lain),
        tandai sekaligus, lalu selesaikan (refund/deposit) satu-satu per customer.
      </p>

      <BookSearchForm books={books} selectedBookId={bookId} />

      {selectedBook && batchGroups.length > 0 && (
        <div className="mt-4">
          <BatchFilterList bookId={selectedBook.id} groups={batchGroups} selectedBatchId={batchId} />
        </div>
      )}

      {selectedBook && (
        <div className="mt-6 space-y-6">
          {batchId && unmarkedCount > 0 && (
            <MarkAllCard bookId={selectedBook.id} batchId={batchId} bookTitle={selectedBook.title} count={unmarkedCount} />
          )}

          {markedItems.length > 0 && (
            <ResolveList
              items={markedItems.map((i) => ({ ...i, subtotalNumber: toNumber(i.subtotal) }))}
              bookTitle={selectedBook.title}
            />
          )}

          {batchGroups.length === 0 && markedItems.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Gak ada order yang belum diproses untuk buku ini saat ini.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
