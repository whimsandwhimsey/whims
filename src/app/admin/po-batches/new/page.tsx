import { BackButton } from '@/components/back-button';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PoBatchForm } from '../po-batch-form';
import { createPoBatch } from '../actions';

export default async function NewPoBatchPage() {
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <BackButton label="Back to PO batches" />
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New PO batch</CardTitle>
        </CardHeader>
        <CardContent>
          <PoBatchForm action={createPoBatch} suppliers={suppliers} />
        </CardContent>
      </Card>
    </div>
  );
}
