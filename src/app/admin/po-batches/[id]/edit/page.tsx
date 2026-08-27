import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PoBatchForm } from '../../po-batch-form';
import { updatePoBatch } from '../../actions';

export default async function EditPoBatchPage({ params }: { params: { id: string } }) {
  const batch = await prisma.purchaseBatch.findUnique({ where: { id: params.id } });
  if (!batch) notFound();

  const boundAction = updatePoBatch.bind(null, batch.id);

  return (
    <div className="p-4 sm:p-6">
      <Link
        href={`/admin/po-batches/${batch.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to batch
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Edit PO batch</CardTitle>
        </CardHeader>
        <CardContent>
          <PoBatchForm action={boundAction} batch={batch} />
        </CardContent>
      </Card>
    </div>
  );
}
