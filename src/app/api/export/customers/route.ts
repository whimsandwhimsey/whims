import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { excelDownloadResponse, styleHeaderRow } from '@/lib/excel';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { orders: true } } },
  });

  return excelDownloadResponse('customers.xlsx', (workbook) => {
    const sheet = workbook.addWorksheet('Customers');
    sheet.columns = [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Address', key: 'address', width: 34 },
      { header: 'Notes', key: 'notes', width: 28 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Orders', key: 'orders', width: 10 },
      { header: 'Created At', key: 'createdAt', width: 18 },
    ];
    for (const c of customers) {
      sheet.addRow({
        name: c.name,
        phone: c.phone,
        address: c.address ?? '',
        notes: c.notes ?? '',
        status: c.status,
        orders: c._count.orders,
        createdAt: c.createdAt.toISOString().slice(0, 10),
      });
    }
    styleHeaderRow(sheet);
  });
}
