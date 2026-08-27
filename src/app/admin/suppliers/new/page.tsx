import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SupplierForm } from '../supplier-form';
import { createSupplier } from '../actions';

export default function NewSupplierPage() {
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
          <CardTitle>Tambah supplier</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierForm action={createSupplier} />
        </CardContent>
      </Card>
    </div>
  );
}
