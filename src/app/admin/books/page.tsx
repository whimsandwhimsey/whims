import Link from 'next/link';
import { Plus, Pencil, Download } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBox } from '@/components/search-box';
import { Pagination } from '@/components/pagination';
import { DeleteButton } from '@/components/delete-button';
import { deleteBook, toggleBookActive } from './actions';
import { bookFormatLabels } from '@/lib/validations';

const PAGE_SIZE = 15;

export default async function BooksPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const q = searchParams.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { author: { contains: q, mode: 'insensitive' as const } },
          { isbn: { contains: q } },
        ],
      }
    : {};

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { publisher: true },
    }),
    prisma.book.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">Books</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
            <a href="/api/export/books" download>
              <Download className="h-4 w-4" /> Export
            </a>
          </Button>
          <Button asChild className="flex-1 sm:flex-none">
            <Link href="/admin/books/new">
              <Plus className="h-4 w-4" /> Add book
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <SearchBox placeholder="Search by title, author, or ISBN…" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Author</th>
                <th className="px-4 py-3 font-medium">Publisher</th>
                <th className="px-4 py-3 font-medium">ISBN</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {books.map((b) => (
                <tr key={b.id} className="hover:bg-secondary/50">
                  <td className="px-2 py-3">
                    {b.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.imageUrl} alt="" className="h-12 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-8 rounded bg-secondary" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{b.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.author || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.publisher?.name || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.isbn || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.format ? bookFormatLabels[b.format] ?? b.format : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <form action={toggleBookActive.bind(null, b.id, !b.isActive)}>
                      <button
                        type="submit"
                        className={
                          b.isActive
                            ? 'rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success'
                            : 'rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                        }
                      >
                        {b.isActive ? 'Active' : 'Archived'}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/books/${b.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <DeleteButton
                        action={deleteBook.bind(null, b.id)}
                        confirmMessage={`Delete "${b.title}"? This cannot be undone.`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {books.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No books found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) => `/admin/books?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`}
        />
      </Card>
    </div>
  );
}
