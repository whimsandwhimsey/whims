import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: z
    .string()
    .min(8, 'Phone number looks too short')
    .max(20)
    .regex(/^[\d+\s-]+$/, 'Only digits, spaces, + and - are allowed'),
  address: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});
export type CustomerFormValues = z.infer<typeof customerSchema>;

export const bookFormatValues = ['PAPERBACK', 'HARDCOVER', 'BOXSET'] as const;
export const bookFormatLabels: Record<string, string> = {
  PAPERBACK: 'Paperback',
  HARDCOVER: 'Hardcover',
  BOXSET: 'Boxset',
};

export const supplierSchema = z.object({
  name: z.string().min(1, 'Nama supplier wajib diisi').max(200),
  notes: z.string().max(1000).optional().or(z.literal('')),
});
export type SupplierFormValues = z.infer<typeof supplierSchema>;

export const publisherSchema = z.object({
  name: z.string().min(1, 'Nama publisher wajib diisi').max(200),
  notes: z.string().max(1000).optional().or(z.literal('')),
});
export type PublisherFormValues = z.infer<typeof publisherSchema>;

export const bookSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300),
  author: z.string().max(200).optional().or(z.literal('')),
  isbn: z.string().max(30).optional().or(z.literal('')),
  format: z.enum(bookFormatValues).optional().or(z.literal('')),
  publisherId: z.string().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});
export type BookFormValues = z.infer<typeof bookSchema>;

export const orderItemSchema = z.object({
  bookId: z.string().optional().nullable(),
  bookTitle: z.string().min(1, 'Book title is required').max(300),
  isbn: z.string().max(30).optional().or(z.literal('')),
  format: z.enum(bookFormatValues).optional().or(z.literal('')),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  sellingPrice: z.coerce.number().min(0, 'Price cannot be negative'),
  cogs: z.coerce.number().min(0, 'COGS cannot be negative').optional().default(0),
  discount: z.coerce.number().min(0, 'Discount cannot be negative'),
});
export type OrderItemFormValues = z.infer<typeof orderItemSchema>;

export const orderStatusValues = [
  'WAITING',
  'ARRIVED',
  'READY_TO_SHIP',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
] as const;

export const courierValues = ['LION', 'OJEK', 'SHOPEE'] as const;

export const orderSchema = z.object({
  customerId: z.string().min(1, 'Please select a customer'),
  poBatchId: z.string().optional().nullable(),
  orderDate: z.string().min(1),
  expectedArrivalDate: z.string().optional().or(z.literal('')),
  actualArrivalDate: z.string().optional().or(z.literal('')),
  status: z.enum(orderStatusValues),
  notes: z.string().max(2000).optional().or(z.literal('')),
  items: z.array(orderItemSchema).min(1, 'Add at least one book item'),
});
export type OrderFormValues = z.infer<typeof orderSchema>;

export const paymentMethodValues = ['QRIS', 'BANK_TRANSFER'] as const;

export const paymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  method: z.enum(paymentMethodValues),
  date: z.string().min(1),
  notes: z.string().max(500).optional().or(z.literal('')),
});
export type PaymentFormValues = z.infer<typeof paymentSchema>;

export const depositApplySchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
});
export type DepositApplyFormValues = z.infer<typeof depositApplySchema>;
