import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { excelDownloadResponse, styleHeaderRow } from '@/lib/excel';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const payments = await prisma.payment.findMany({
    orderBy: { date: 'desc' },
    include: { customer: true, order: { select: { orderNumber: true } } },
  });

  return excelDownloadResponse('payments.xlsx', (workbook) => {
    const sheet = workbook.addWorksheet('Payments');
    sheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Customer', key: 'customer', width: 22 },
      { header: 'Order #', key: 'orderNumber', width: 20 },
      { header: 'Method', key: 'method', width: 16 },
      { header: 'Amount', key: 'amount', width: 14 },
      { header: 'Notes', key: 'notes', width: 28 },
    ];
    for (const p of payments) {
      sheet.addRow({
        date: p.date.toISOString().slice(0, 10),
        customer: p.customer.name,
        orderNumber: p.order?.orderNumber ?? 'Deposit top-up',
        method: p.method === 'BANK_TRANSFER' ? 'Bank Transfer' : 'QRIS',
        amount: Number(p.amount.toString()),
        notes: p.notes ?? '',
      });
    }
    styleHeaderRow(sheet);
  });
}
