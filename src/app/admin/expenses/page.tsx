import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { DeleteButton } from '@/components/delete-button';
import { AddExpenseForm } from './add-expense-form';
import { deleteExpense } from './actions';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toNumber } from '@/lib/calculations';

const CATEGORY_LABELS: Record<string, string> = {
  PACKING: 'Packing',
  SHIPPING_TO_WAREHOUSE: 'Shipping to warehouse',
  OTHER: 'Other',
};

export default async function ExpensesPage() {
  const [expenses, orders] = await Promise.all([
    prisma.expense.findMany({
      orderBy: { date: 'desc' },
      include: { order: { select: { orderNumber: true } } },
    }),
    prisma.order.findMany({
      orderBy: { orderDate: 'desc' },
      take: 100,
      select: { id: true, orderNumber: true },
    }),
  ]);

  const total = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            {expenses.length} recorded · Total {formatCurrency(total)}
          </p>
        </div>
        <AddExpenseForm orders={orders} />
      </div>

      <div className="space-y-2">
        {expenses.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{CATEGORY_LABELS[e.category] ?? e.category}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(e.date)}
                  {e.order ? (
                    <>
                      {' · '}
                      <Link href={`/admin/orders/${e.orderId}`} className="text-primary hover:underline">
                        {e.order.orderNumber}
                      </Link>
                    </>
                  ) : (
                    ' · General'
                  )}
                </p>
                {e.description && <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-destructive">-{formatCurrency(e.amount.toString())}</p>
                <DeleteButton
                  action={deleteExpense.bind(null, e.id)}
                  confirmMessage="Delete this expense?"
                />
              </div>
            </div>
          </Card>
        ))}
        {expenses.length === 0 && (
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No expenses recorded yet.
          </CardContent>
        )}
      </div>
    </div>
  );
}
