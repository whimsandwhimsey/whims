import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { excelDownloadResponse, styleHeaderRow } from '@/lib/excel';
import { bookFormatLabels, orderTypeLabels } from '@/lib/validations';
import { NextResponse } from 'next/server';

export const COLUMN_DEFS: { id: string; label: string }[] = [
  { id: 'orderNumber', label: 'Order #' },
  { id: 'customerName', label: 'Customer' },
  { id: 'customerPhone', label: 'No. HP' },
  { id: 'poBatchName', label: 'PO Batch' },
  { id: 'orderType', label: 'Order Type' },
  { id: 'poMonth', label: 'PO Month' },
  { id: 'etaMonth', label: 'ETA Month' },
  { id: 'supplierName', label: 'Supplier' },
  { id: 'bookTitle', label: 'Judul Buku' },
  { id: 'isbn', label: 'ISBN' },
  { id: 'publisherName', label: 'Publisher' },
  { id: 'format', label: 'Format' },
  { id: 'quantity', label: 'Qty' },
  { id: 'sellingPrice', label: 'Harga Satuan' },
  { id: 'discount', label: 'Diskon' },
  { id: 'subtotal', label: 'Subtotal' },
  { id: 'orderStatus', label: 'Status Kirim' },
  { id: 'paymentStatus', label: 'Status Bayar' },
  { id: 'orderTotalAmount', label: 'Total Order' },
  { id: 'orderOutstanding', label: 'Outstanding Order' },
];
const COLUMN_IDS = new Set(COLUMN_DEFS.map((c) => c.id));

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const batchId = params.get('batchId');
  const columnsParam = params.get('columns');
  const columns = columnsParam
    ? columnsParam.split(',').filter((c) => COLUMN_IDS.has(c))
    : COLUMN_DEFS.map((c) => c.id);

  const where: Record<string, unknown> = {};
  if (batchId) {
    where.poBatchId = batchId;
  } else {
    // Same filters as the Data Order list page.
    const q = params.get('q')?.trim();
    const statuses = (params.get('status') ?? '').split(',').filter(Boolean);
    const paymentStatuses = (params.get('paymentStatus') ?? '').split(',').filter(Boolean);
    const batchIds = (params.get('batch') ?? '').split(',').filter(Boolean);
    const orderTypes = (params.get('orderType') ?? '').split(',').filter(Boolean);
    const supplierIds = (params.get('supplier') ?? '').split(',').filter(Boolean);
    const poMonths = (params.get('poMonth') ?? '').split(',').filter(Boolean);
    const publisherIds = (params.get('publisher') ?? '').split(',').filter(Boolean);
    if (statuses.length) where.status = { in: statuses };
    if (paymentStatuses.length) where.paymentStatus = { in: paymentStatuses };
    if (batchIds.length) where.poBatchId = { in: batchIds };
    if (orderTypes.length) where.orderType = { in: orderTypes };
    if (supplierIds.length) where.supplierId = { in: supplierIds };
    if (poMonths.length) where.poMonth = { in: poMonths };
    if (publisherIds.length) where.items = { some: { book: { publisherId: { in: publisherIds } } } };
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
        { items: { some: { bookTitle: { contains: q, mode: 'insensitive' } } } },
      ];
    }
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { orderDate: 'desc' },
    include: {
      customer: true,
      supplier: true,
      poBatch: { select: { name: true } },
      items: { include: { book: { include: { publisher: true } } } },
    },
  });

  const rows = orders.flatMap((o) =>
    o.items.map((it) => {
      const full: Record<string, string | number> = {
        orderNumber: o.orderNumber,
        customerName: o.customer.name,
        customerPhone: o.customer.phone,
        poBatchName: o.poBatch?.name ?? '',
        orderType: orderTypeLabels[o.orderType] ?? o.orderType,
        poMonth: o.poMonth ?? '',
        etaMonth: o.etaMonth ?? '',
        supplierName: o.supplier?.name ?? '',
        bookTitle: it.bookTitle,
        isbn: it.isbn ?? '',
        publisherName: it.book?.publisher?.name ?? '',
        format: it.format ? bookFormatLabels[it.format] ?? it.format : '',
        quantity: it.quantity,
        sellingPrice: Number(it.sellingPrice.toString()),
        discount: Number(it.discount.toString()),
        subtotal: Number(it.subtotal.toString()),
        orderStatus: o.status,
        paymentStatus: o.paymentStatus,
        orderTotalAmount: Number(o.totalAmount.toString()),
        orderOutstanding: Number(o.outstandingBalance.toString()),
      };
      const filtered: Record<string, string | number> = {};
      for (const col of columns) filtered[col] = full[col];
      return filtered;
    })
  );

  return excelDownloadResponse('export.xlsx', (workbook) => {
    const sheet = workbook.addWorksheet('Export');
    sheet.columns = columns.map((id) => ({
      header: COLUMN_DEFS.find((c) => c.id === id)?.label ?? id,
      key: id,
      width: 20,
    }));
    for (const row of rows) sheet.addRow(row);
    styleHeaderRow(sheet);
  });
}
