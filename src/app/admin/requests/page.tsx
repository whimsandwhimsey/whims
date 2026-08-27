import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  confirmTopUpRequest,
  rejectTopUpRequest,
  confirmAddressChange,
  rejectAddressChange,
} from './actions';

export default async function RequestsPage() {
  const [topUps, addressChanges] = await Promise.all([
    prisma.topUpRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { customer: true },
    }),
    prisma.addressChangeRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { customer: true },
    }),
  ]);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-primary">Requests</h1>
        <p className="text-sm text-muted-foreground">
          Things customers submitted themselves that need your confirmation.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deposit top-up requests ({topUps.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending.</p>
            ) : (
              topUps.map((r) => (
                <div key={r.id} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-medium">{r.customer.name}</p>
                    <p className="font-semibold text-success">{formatCurrency(r.amount.toString())}</p>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {r.customer.phone} · Requested {formatDate(r.createdAt)}
                  </p>
                  <div className="flex gap-2">
                    <form action={confirmTopUpRequest.bind(null, r.id)} className="flex-1">
                      <Button type="submit" size="sm" className="w-full">
                        Confirm
                      </Button>
                    </form>
                    <form action={rejectTopUpRequest.bind(null, r.id)} className="flex-1">
                      <Button type="submit" variant="outline" size="sm" className="w-full">
                        Reject
                      </Button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address change requests ({addressChanges.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {addressChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending.</p>
            ) : (
              addressChanges.map((r) => (
                <div key={r.id} className="rounded-md border border-border p-3">
                  <p className="font-medium">{r.customer.name}</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {r.customer.phone} · Requested {formatDate(r.createdAt)}
                  </p>
                  <div className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">Current</p>
                      <p>{r.customer.address || '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Requested</p>
                      <p className="font-medium">{r.newAddress}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <form action={confirmAddressChange.bind(null, r.id)} className="flex-1">
                      <Button type="submit" size="sm" className="w-full">
                        Confirm
                      </Button>
                    </form>
                    <form action={rejectAddressChange.bind(null, r.id)} className="flex-1">
                      <Button type="submit" variant="outline" size="sm" className="w-full">
                        Reject
                      </Button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
