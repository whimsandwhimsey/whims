import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomerForm } from '../../customer-form';
import { updateCustomer } from '../../actions';

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const customer = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!customer) notFound();

  const boundAction = updateCustomer.bind(null, customer.id);

  return (
    <div className="p-6">
      <Link
        href="/admin/customers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Edit customer</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm action={boundAction} customer={customer} />
        </CardContent>
      </Card>
    </div>
  );
}
