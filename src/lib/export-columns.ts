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

export const SIMPLE_PRESET = ['orderNumber', 'customerName', 'bookTitle', 'quantity', 'subtotal'];
export const ALL_COLUMN_IDS = COLUMN_DEFS.map((c) => c.id);
