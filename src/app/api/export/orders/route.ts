import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { excelDownloadResponse, styleHeaderRow } from '@/lib/excel';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    orderBy: { orderDate: 'desc' },
    include: { customer: true },
  });

  return excelDownloadResponse('orders.xlsx', (workbook) => {
    const sheet = workbook.addWorksheet('Orders');
    sheet.columns = [
      { header: 'Order #', key: 'orderNumber', width: 20 },
      { header: 'Customer', key: 'customer', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Order Date', key: 'orderDate', width: 14 },
      { header: 'Expected Arrival', key: 'expected', width: 16 },
      { header: 'Actual Arrival', key: 'actual', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
      { header: 'Discount', key: 'discount', width: 12 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'COGS', key: 'cogs', width: 14 },
      { header: 'Profit', key: 'profit', width: 14 },
      { header: 'Amount Paid', key: 'paid', width: 14 },
      { header: 'Outstanding', key: 'outstanding', width: 14 },
      { header: 'Payment Status', key: 'paymentStatus', width: 16 },
    ];
    for (const o of orders) {
      sheet.addRow({
        orderNumber: o.orderNumber,
        customer: o.customer.name,
        phone: o.customer.phone,
        orderDate: o.orderDate.toISOString().slice(0, 10),
        expected: o.expectedArrivalDate?.toISOString().slice(0, 10) ?? '',
        actual: o.actualArrivalDate?.toISOString().slice(0, 10) ?? '',
        status: o.status,
        subtotal: Number(o.subtotal.toString()),
        discount: Number(o.discountTotal.toString()),
        total: Number(o.totalAmount.toString()),
        cogs: Number(o.totalCogs.toString()),
        profit: Number(o.profit.toString()),
        paid: Number(o.amountPaid.toString()),
        outstanding: Number(o.outstandingBalance.toString()),
        paymentStatus: o.paymentStatus,
      });
    }
    styleHeaderRow(sheet);
  });
}
