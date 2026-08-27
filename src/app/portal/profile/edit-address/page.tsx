import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { EditAddressForm } from './edit-address-form';

export default async function EditAddressPage() {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const [customer, pendingRequest] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.addressChangeRequest.findFirst({
      where: { customerId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-sm">
        <Link
          href="/portal/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to your orders
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Update your address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Current address on file
              </p>
              <p className="text-sm">{customer?.address || 'No address on file yet.'}</p>
            </div>

            {pendingRequest && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Waiting for confirmation</p>
                <p className="mt-1 text-xs">
                  You requested: {pendingRequest.newAddress}
                  <br />
                  Submitted {formatDate(pendingRequest.createdAt)}. We&apos;ll update your address
                  once the store confirms it.
                </p>
              </div>
            )}

            <EditAddressForm defaultValue={pendingRequest?.newAddress ?? customer?.address ?? ''} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
