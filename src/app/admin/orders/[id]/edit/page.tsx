import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { OrderForm } from '../../order-form';

export default async function EditOrderPage({ params }: { params: { id: string } }) {
  const [order, customers, books, suppliers, openBatches] = await Promise.all([
    prisma.order.findUnique({
      where: { id: params.id },
      include: { items: true },
    }),
    prisma.customer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } }),
    prisma.book.findMany({
      where: { isActive: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, isbn: true, format: true },
    }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.purchaseBatch.findMany({
      where: { isOpen: true, type: { in: ['PO_REGULAR', 'PO_REMAINDER'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, type: true, poMonth: true, etaMonth: true, supplierId: true },
    }),
  ]);

  if (!order) notFound();

  return (
    <div className="p-6">
      <Link
        href={`/admin/orders/${order.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to order
      </Link>

      <h1 className="mb-6 font-display text-2xl font-semibold text-primary">Edit {order.orderNumber}</h1>

      <div className="max-w-3xl">
        <OrderForm customers={customers} books={books} suppliers={suppliers} openBatches={openBatches} order={order} />
      </div>
    </div>
  );
}
