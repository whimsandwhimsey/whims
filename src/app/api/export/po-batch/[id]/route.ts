import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { excelDownloadResponse, styleHeaderRow } from '@/lib/excel';
import { bookFormatLabels } from '@/lib/validations';
import { NextResponse } from 'next/server';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const batch = await prisma.purchaseBatch.findUnique({ where: { id: params.id } });
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

  const items = await prisma.orderItem.findMany({
    where: { order: { poBatchId: params.id } },
    include: { book: { include: { publisher: true } } },
    orderBy: { bookTitle: 'asc' },
  });

  return excelDownloadResponse(`po-batch-${batch.name.replace(/[^a-z0-9]+/gi, '-')}.xlsx`, (workbook) => {
    const sheet = workbook.addWorksheet('PO Batch');
    sheet.columns = [
      { header: 'Publisher', key: 'publisher', width: 22 },
      { header: 'ISBN', key: 'isbn', width: 18 },
      { header: 'Judul', key: 'title', width: 32 },
      { header: 'Format', key: 'format', width: 14 },
      { header: 'Qty', key: 'qty', width: 8 },
      { header: 'Harga', key: 'price', width: 14 },
    ];
    for (const item of items) {
      sheet.addRow({
        publisher: item.book?.publisher?.name ?? '',
        isbn: item.isbn ?? '',
        title: item.bookTitle,
        format: item.format ? bookFormatLabels[item.format] ?? item.format : '',
        qty: item.quantity,
        price: Number(item.sellingPrice.toString()),
      });
    }
    styleHeaderRow(sheet);
  });
}
