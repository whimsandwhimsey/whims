import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toNumber } from '@/lib/calculations';
import { EditPaymentForm } from './edit-payment-form';

export default async function EditPaymentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { returnTo?: string };
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    include: { order: true, customer: true },
  });
  if (!payment) notFound();

  const returnTo = searchParams.returnTo || (payment.orderId ? `/admin/orders/${payment.orderId}` : `/admin/customers/${payment.customerId}`);

  return (
    <div className="p-4 sm:p-6">
      <Link
        href={returnTo}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Edit payment</CardTitle>
          <p className="text-sm text-muted-foreground">
            {payment.customer.name}
            {payment.order ? ` · Order ${payment.order.orderNumber}` : ' · Deposit top-up'}
          </p>
        </CardHeader>
        <CardContent>
          <EditPaymentForm
            paymentId={payment.id}
            returnTo={returnTo}
            initial={{
              date: payment.date.toISOString().slice(0, 10),
              amount: toNumber(payment.amount).toString(),
              method: payment.method,
              notes: payment.notes ?? '',
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
