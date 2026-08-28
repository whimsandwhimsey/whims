'use client';

import { useRouter } from 'next/navigation';
import { SearchableSelect } from '@/components/searchable-select';

export function BookSearchForm({
  books,
  selectedBookId,
}: {
  books: { id: string; title: string; isbn: string | null }[];
  selectedBookId?: string;
}) {
  const router = useRouter();

  return (
    <SearchableSelect
      id="bookSearch"
      options={books.map((b) => ({ value: b.id, label: b.title, sublabel: b.isbn ?? undefined }))}
      value={selectedBookId ?? ''}
      onChange={(bookId) => router.push(`/admin/oos?bookId=${bookId}`)}
      placeholder="Cari judul buku…"
      emptyLabel="— Pilih buku —"
    />
  );
}
