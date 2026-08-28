import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/calculations';
import { BookSearchForm } from './book-search-form';
import { MarkAllCard, ResolveList } from './oos-bulk-list';

export default async function BulkOosPage({ searchParams }: { searchParams: { bookId?: string } }) {
  const books = await prisma.book.findMany({
    where: { isActive: true },
    orderBy: { title: 'asc' },
    select: { id: true, title: true, isbn: true },
  });

  const bookId = searchParams.bookId;
  let selectedBook: { id: string; title: string } | null = null;
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
    const items = await prisma.orderItem.findMany({
      where: { bookId, order: { status: { in: [...OPEN_STATUSES] } } },
      include: { order: { include: { customer: true } } },
      orderBy: { createdAt: 'asc' },
    });

    unmarkedCount = items.filter((i) => !i.isOos).length;
    markedItems = items
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
        Cari buku, lihat semua order yang belum diproses, tandai OOS sekaligus, lalu selesaikan
        (refund/deposit) satu-satu per customer.
      </p>

      <BookSearchForm books={books} selectedBookId={bookId} />

      {selectedBook && (
        <div className="mt-6 space-y-6">
          {unmarkedCount > 0 && (
            <MarkAllCard bookId={selectedBook.id} bookTitle={selectedBook.title} count={unmarkedCount} />
          )}

          {markedItems.length > 0 && (
            <ResolveList
              items={markedItems.map((i) => ({ ...i, subtotalNumber: toNumber(i.subtotal) }))}
              bookTitle={selectedBook.title}
            />
          )}

          {unmarkedCount === 0 && markedItems.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Gak ada order yang belum diproses untuk buku ini saat ini.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
