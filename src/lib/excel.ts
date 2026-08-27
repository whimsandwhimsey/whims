import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';

/**
 * Builds an Excel workbook via the given callback, then returns it as a
 * downloadable file response. Centralizes the response headers so every
 * export route behaves identically.
 */
export async function excelDownloadResponse(
  filename: string,
  build: (workbook: ExcelJS.Workbook) => Promise<void> | void
): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Whims & Whimsey OMS';
  workbook.created = new Date();

  await build(workbook);

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

/** Applies consistent header styling to a worksheet's first row. */
export function styleHeaderRow(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EDE3' },
  };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}
