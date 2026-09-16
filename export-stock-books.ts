process.loadEnvFile();

import { Client as PgClient } from 'pg';
import ExcelJS from 'exceljs';

async function main() {
  const legacy = new PgClient({ connectionString: process.env.SUPABASE_DATABASE_URL });
  await legacy.connect();

  const { rows } = await legacy.query(`
    select o.id as order_id, o.created_at, oi.title, oi.isbn, oi.qty, oi.price
    from orders o
    join order_items oi on oi.order_id = o.id
    where o.order_type = 'Stock'
    order by o.created_at desc, oi.title
  `);

  await legacy.end();

  if (rows.length === 0) {
    console.log('No Stock order items found — nothing to export.');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stock Books');
  sheet.columns = [
    { header: 'Order ID (legacy)', key: 'order_id', width: 20 },
    { header: 'Tanggal', key: 'created_at', width: 18 },
    { header: 'Judul', key: 'title', width: 40 },
    { header: 'ISBN', key: 'isbn', width: 18 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Harga', key: 'price', width: 14 },
  ];
  for (const r of rows) {
    sheet.addRow({
      order_id: r.order_id,
      created_at: r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : '',
      title: r.title,
      isbn: r.isbn ?? '',
      qty: r.qty,
      price: Number(r.price ?? 0),
    });
  }
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

  await workbook.xlsx.writeFile('stock-books-export.xlsx');
  console.log(`\n✓ Exported ${rows.length} book line(s) to stock-books-export.xlsx`);
  console.log('  Download it from the Codespace file explorer: right-click the file → Download.\n');
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
