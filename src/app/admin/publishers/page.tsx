import Link from 'next/link';
import { Plus, Pencil } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchBox } from '@/components/search-box';
import { DeleteButton } from '@/components/delete-button';
import { deletePublisher, togglePublisherActive } from './actions';

export default async function PublishersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q?.trim() ?? '';

  const where = q ? { name: { contains: q, mode: 'insensitive' as const } } : {};

  const publishers = await prisma.publisher.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { _count: { select: { books: true } } },
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">Publishers</h1>
          <p className="text-sm text-muted-foreground">{publishers.length} total</p>
        </div>
        <Button asChild>
          <Link href="/admin/publishers/new">
            <Plus className="h-4 w-4" /> Tambah publisher
          </Link>
        </Button>
      </div>

      <div className="mb-4">
        <SearchBox placeholder="Cari nama publisher…" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Buku</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {publishers.map((s) => (
                <tr key={s.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s._count.books}</td>
                  <td className="px-4 py-3">
                    <form action={togglePublisherActive.bind(null, s.id, !s.isActive)}>
                      <button
                        type="submit"
                        className={
                          s.isActive
                            ? 'rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success'
                            : 'rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                        }
                      >
                        {s.isActive ? 'Active' : 'Archived'}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/publishers/${s.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <DeleteButton
                        action={deletePublisher.bind(null, s.id)}
                        confirmMessage={`Hapus publisher "${s.name}"? Kalau masih dipakai di Buku, arsipkan aja.`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {publishers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Belum ada publisher.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
