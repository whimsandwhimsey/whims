import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { OrderForm } from '../order-form';

export default async function NewOrderPage() {
  const [customers, books, suppliers] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } }),
    prisma.book.findMany({
      where: { isActive: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, isbn: true, format: true },
    }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="p-6">
      <Link
        href="/admin/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <h1 className="mb-6 font-display text-2xl font-semibold text-primary">New order</h1>

      <div className="max-w-3xl">
        <OrderForm customers={customers} books={books} suppliers={suppliers} />
      </div>
    </div>
  );
}
