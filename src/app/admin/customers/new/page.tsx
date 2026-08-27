import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomerForm } from '../customer-form';
import { createCustomer } from '../actions';

export default function NewCustomerPage() {
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
          <CardTitle>New customer</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm action={createCustomer} />
        </CardContent>
      </Card>
    </div>
  );
}
