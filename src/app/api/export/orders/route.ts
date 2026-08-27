import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { excelDownloadResponse, styleHeaderRow } from '@/lib/excel';
import { orderTypeLabels } from '@/lib/validations';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  // Mirrors the exact same filter logic as the Data Order list page, so
  // "export" always exports precisely what's currently on screen.
  const params = request.nextUrl.searchParams;
  const q = params.get('q')?.trim() ?? '';
  const statuses = (params.get('status') ?? '').split(',').filter(Boolean);
  const paymentStatuses = (params.get('paymentStatus') ?? '').split(',').filter(Boolean);
  const batchIds = (params.get('batch') ?? '').split(',').filter(Boolean);
  const orderTypes = (params.get('orderType') ?? '').split(',').filter(Boolean);
  const supplierIds = (params.get('supplier') ?? '').split(',').filter(Boolean);
  const poMonths = (params.get('poMonth') ?? '').split(',').filter(Boolean);

  const where: Record<string, unknown> = {};
  if (statuses.length > 0) where.status = { in: statuses };
  if (paymentStatuses.length > 0) where.paymentStatus = { in: paymentStatuses };
  if (batchIds.length > 0) where.poBatchId = { in: batchIds };
  if (orderTypes.length > 0) where.orderType = { in: orderTypes };
  if (supplierIds.length > 0) where.supplierId = { in: supplierIds };
  if (poMonths.length > 0) where.poMonth = { in: poMonths };
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q } } },
      { items: { some: { bookTitle: { contains: q, mode: 'insensitive' } } } },
      { items: { some: { isbn: { contains: q } } } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { orderDate: 'desc' },
    include: { customer: true, supplier: true },
  });

  return excelDownloadResponse('orders.xlsx', (workbook) => {
    const sheet = workbook.addWorksheet('Orders');
    sheet.columns = [
      { header: 'Order #', key: 'orderNumber', width: 20 },
      { header: 'Customer', key: 'customer', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Order Type', key: 'orderType', width: 16 },
      { header: 'Supplier', key: 'supplier', width: 18 },
      { header: 'PO Month', key: 'poMonth', width: 12 },
      { header: 'ETA Month', key: 'etaMonth', width: 12 },
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
        orderType: orderTypeLabels[o.orderType] ?? o.orderType,
        supplier: o.supplier?.name ?? '',
        poMonth: o.poMonth ?? '',
        etaMonth: o.etaMonth ?? '',
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
