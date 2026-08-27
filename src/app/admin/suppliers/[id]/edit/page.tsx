import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SupplierForm } from '../../supplier-form';
import { updateSupplier } from '../../actions';

export default async function EditSupplierPage({ params }: { params: { id: string } }) {
  const supplier = await prisma.supplier.findUnique({ where: { id: params.id } });
  if (!supplier) notFound();

  const boundAction = updateSupplier.bind(null, supplier.id);

  return (
    <div className="p-6">
      <Link
        href="/admin/suppliers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to suppliers
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Edit supplier</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierForm action={boundAction} supplier={supplier} />
        </CardContent>
      </Card>
    </div>
  );
}
