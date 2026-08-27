import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PublisherForm } from '../../publisher-form';
import { updatePublisher } from '../../actions';

export default async function EditPublisherPage({ params }: { params: { id: string } }) {
  const publisher = await prisma.publisher.findUnique({ where: { id: params.id } });
  if (!publisher) notFound();

  const boundAction = updatePublisher.bind(null, publisher.id);

  return (
    <div className="p-6">
      <Link
        href="/admin/publishers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to publishers
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Edit publisher</CardTitle>
        </CardHeader>
        <CardContent>
          <PublisherForm action={boundAction} publisher={publisher} />
        </CardContent>
      </Card>
    </div>
  );
}
