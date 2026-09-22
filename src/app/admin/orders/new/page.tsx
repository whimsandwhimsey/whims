import { BackButton } from '@/components/back-button';
import { prisma } from '@/lib/prisma';
import { OrderForm } from '../order-form';

export default async function NewOrderPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const [customers, books, suppliers, openBatches] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } }),
    prisma.book.findMany({
      where: { isActive: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, isbn: true, format: true, imageUrl: true },
    }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.purchaseBatch.findMany({
      where: { type: { in: ['PO_REGULAR', 'PO_REMAINDER'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        poMonth: true,
        etaMonth: true,
        supplierId: true,
        dpType: true,
        dpValue: true,
        isOpen: true,
      },
    }),
  ]);

  return (
    <div className="p-6">
      <div className="mb-4">
        <BackButton label="Back to orders" />
      </div>

      <h1 className="mb-6 font-display text-2xl font-semibold text-primary">New order</h1>

      <div className="max-w-3xl">
        <OrderForm
          customers={customers}
          books={books}
          suppliers={suppliers}
          openBatches={openBatches}
          initialBatchId={searchParams.batchId}
        />
      </div>
    </div>
  );
}
