import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookForm } from '../book-form';
import { createBook } from '../actions';

export default async function NewBookPage() {
  const publishers = await prisma.publisher.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  const publisherOptions = publishers.map((p) => ({ value: p.id, label: p.name }));

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
          <CardTitle>Add book</CardTitle>
        </CardHeader>
        <CardContent>
          <BookForm action={createBook} publisherOptions={publisherOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
