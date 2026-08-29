import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getShippingRates } from '@/lib/biteship';
import { toNumber } from '@/lib/calculations';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const orderId = request.nextUrl.searchParams.get('orderId');
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, items: { include: { book: true } } },
  });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (!order.customer.postalCode) {
    return NextResponse.json({ error: 'Customer belum punya kode pos — isi dulu di halaman Customer.' }, { status: 400 });
  }

  const weightGrams = order.items.reduce((sum, it) => sum + (it.book?.weightGrams ?? 250) * it.quantity, 0);

  try {
    const rates = await getShippingRates({
      destinationPostalCode: order.customer.postalCode,
      weightGrams,
      itemValue: Math.round(toNumber(order.totalAmount)),
      itemName: order.items[0]?.bookTitle,
    });
    return NextResponse.json({ rates, weightGrams });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to fetch rates' }, { status: 500 });
  }
}
