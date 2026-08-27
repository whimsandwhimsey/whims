import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';
import { excelDownloadResponse, styleHeaderRow } from '@/lib/excel';
import { bookFormatLabels } from '@/lib/validations';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const books = await prisma.book.findMany({ orderBy: { title: 'asc' } });

  return excelDownloadResponse('books.xlsx', (workbook) => {
    const sheet = workbook.addWorksheet('Books');
    sheet.columns = [
      { header: 'Title', key: 'title', width: 34 },
      { header: 'Author', key: 'author', width: 24 },
      { header: 'ISBN', key: 'isbn', width: 18 },
      { header: 'Format', key: 'format', width: 14 },
      { header: 'Active', key: 'active', width: 10 },
      { header: 'Notes', key: 'notes', width: 28 },
    ];
    for (const b of books) {
      sheet.addRow({
        title: b.title,
        author: b.author ?? '',
        isbn: b.isbn ?? '',
        format: b.format ? bookFormatLabels[b.format] ?? b.format : '',
        active: b.isActive ? 'Yes' : 'No',
        notes: b.notes ?? '',
      });
    }
    styleHeaderRow(sheet);
  });
}
