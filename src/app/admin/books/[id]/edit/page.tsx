import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookForm } from '../../book-form';
import { updateBook } from '../../actions';

export default async function EditBookPage({ params }: { params: { id: string } }) {
  const [book, publishers] = await Promise.all([
    prisma.book.findUnique({ where: { id: params.id } }),
    prisma.publisher.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  if (!book) notFound();
  const publisherOptions = publishers.map((p) => ({ value: p.id, label: p.name }));

  const boundAction = updateBook.bind(null, book.id);

  return (
    <div className="p-6">
      <Link
        href="/admin/books"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to books
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Edit book</CardTitle>
        </CardHeader>
        <CardContent>
          <BookForm action={boundAction} book={book} publisherOptions={publisherOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
