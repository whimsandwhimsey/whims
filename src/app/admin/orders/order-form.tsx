'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchableSelect } from '@/components/searchable-select';
import { formatCurrency } from '@/lib/utils';
import { computeOrderTotals, computeItemSubtotal, toNumber } from '@/lib/calculations';
import {
  orderStatusValues,
  bookFormatValues,
  bookFormatLabels,
  orderTypeValues,
  orderTypeLabels,
  orderTypesWithPoMonth,
} from '@/lib/validations';
import { saveOrder, type SaveOrderInput } from './actions';
import { quickCreateCustomer } from '../customers/actions';

type Customer = { id: string; name: string; phone: string };
type Book = {
  id: string;
  title: string;
  isbn: string | null;
  format: string | null;
};
type PoBatch = { id: string; name: string; type: string; expectedArrivalDate: Date | null };
type Supplier = { id: string; name: string };

type ItemRow = {
  key: string;
  bookId: string;
  bookTitle: string;
  isbn: string;
  format: string;
  quantity: number;
  sellingPrice: number;
  cogs: number;
  discount: number;
};

type ExistingOrder = {
  id: string;
  customerId: string;
  orderType: string;
  poMonth: string | null;
  etaMonth: string | null;
  eventName: string | null;
  supplierId: string | null;
  dpType: string | null;
  dpValue: unknown;
  poBatchId: string | null;
  orderDate: Date;
  expectedArrivalDate: Date | null;
  actualArrivalDate: Date | null;
  status: string;
  notes: string | null;
  items: {
    bookId: string | null;
    bookTitle: string;
    isbn: string | null;
    format: string | null;
    quantity: number;
    sellingPrice: unknown;
    cogs: unknown;
    discount: unknown;
  }[];
};

const STATUS_LABELS: Record<string, string> = {
  WAITING: 'Waiting',
  ARRIVED: 'Arrived',
  READY_TO_SHIP: 'Ready to Ship',
  SHIPPED: 'Shipped',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function newRowKey() {
  return Math.random().toString(36).slice(2, 10);
}

export function OrderForm({
  customers,
  books,
  poBatches,
  suppliers,
  order,
}: {
  customers: Customer[];
  books: Book[];
  poBatches: PoBatch[];
  suppliers: Supplier[];
  order?: ExistingOrder;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(order?.customerId ?? '');
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(customers);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [isCreatingCustomer, startCreatingCustomer] = useTransition();
  const [orderType, setOrderType] = useState(order?.orderType ?? 'READY_STOCK');
  const [poMonth, setPoMonth] = useState(order?.poMonth ?? '');
  const [etaMonth, setEtaMonth] = useState(order?.etaMonth ?? '');
  const [eventName, setEventName] = useState(order?.eventName ?? '');
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? '');
  const [dpType, setDpType] = useState(order?.dpType ?? 'PERCENTAGE');
  const [dpValue, setDpValue] = useState(
    order?.dpValue !== undefined && order?.dpValue !== null ? String(toNumber(order.dpValue as any)) : '25'
  );
  const [poBatchId, setPoBatchId] = useState(order?.poBatchId ?? '');
  const [orderDate, setOrderDate] = useState(
    toDateInputValue(order?.orderDate) || new Date().toISOString().slice(0, 10)
  );
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(
    toDateInputValue(order?.expectedArrivalDate)
  );
  const [actualArrivalDate, setActualArrivalDate] = useState(
    toDateInputValue(order?.actualArrivalDate)
  );
  const [status, setStatus] = useState(order?.status ?? 'WAITING');
  const [notes, setNotes] = useState(order?.notes ?? '');

  const needsPoMonth = (orderTypesWithPoMonth as readonly string[]).includes(orderType);

  const [items, setItems] = useState<ItemRow[]>(
    order?.items.length
      ? order.items.map((it) => ({
          key: newRowKey(),
          bookId: it.bookId ?? '',
          bookTitle: it.bookTitle,
          isbn: it.isbn ?? '',
          format: it.format ?? '',
          quantity: it.quantity,
          sellingPrice: toNumber(it.sellingPrice as any),
          cogs: toNumber(it.cogs as any),
          discount: toNumber(it.discount as any),
        }))
      : [
          {
            key: newRowKey(),
            bookId: '',
            bookTitle: '',
            isbn: '',
            format: '',
            quantity: 1,
            sellingPrice: 0,
            cogs: 0,
            discount: 0,
          },
        ]
  );

  const totals = useMemo(() => computeOrderTotals(items), [items]);

  const selectedBatch = poBatches.find((b) => b.id === poBatchId);

  const NEW_CUSTOMER_VALUE = '__new_customer__';
  const customerOptions = useMemo(
    () => [
      { value: NEW_CUSTOMER_VALUE, label: '+ Add new customer', sublabel: 'Not in the system yet' },
      ...localCustomers.map((c) => ({ value: c.id, label: c.name, sublabel: c.phone })),
    ],
    [localCustomers]
  );

  function handleCustomerSelect(value: string) {
    if (value === NEW_CUSTOMER_VALUE) {
      setShowNewCustomerForm(true);
      setNewCustomerError(null);
      return;
    }
    setCustomerId(value);
  }

  function handleCreateCustomer() {
    setNewCustomerError(null);
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      setNewCustomerError('Name and phone are required.');
      return;
    }
    startCreatingCustomer(async () => {
      const formData = new FormData();
      formData.set('name', newCustomerName.trim());
      formData.set('phone', newCustomerPhone.trim());
      formData.set('address', newCustomerAddress.trim());
      const result = await quickCreateCustomer(formData);
      if (!result.success) {
        setNewCustomerError(result.error);
        return;
      }
      setLocalCustomers((prev) => [...prev, { id: result.id, name: result.name, phone: result.phone }]);
      setCustomerId(result.id);
      setShowNewCustomerForm(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerAddress('');
    });
  }
  const poBatchOptions = useMemo(
    () => poBatches.map((b) => ({ value: b.id, label: b.name })),
    [poBatches]
  );
  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers]
  );
  const bookOptions = useMemo(
    () =>
      books.map((b) => ({
        value: b.id,
        label: b.title,
        sublabel: [b.format ? bookFormatLabels[b.format] ?? b.format : null, b.isbn].filter(Boolean).join(' · '),
      })),
    [books]
  );

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setItems((prev) => [
      ...prev,
      {
        key: newRowKey(),
        bookId: '',
        bookTitle: '',
        isbn: '',
        format: '',
        quantity: 1,
        sellingPrice: 0,
        cogs: 0,
        discount: 0,
      },
    ]);
  }

  function removeRow(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  function handleBookSelect(key: string, bookId: string) {
    const book = books.find((b) => b.id === bookId);
    if (!book) {
      updateItem(key, { bookId: '' });
      return;
    }
    // Book catalog only carries title/author/isbn/format now — price and
    // COGS always come fresh from the order, since they can change between
    // POs even for the same title.
    updateItem(key, {
      bookId: book.id,
      bookTitle: book.title,
      isbn: book.isbn ?? '',
      format: book.format ?? '',
    });
  }

  function handleBatchChange(nextBatchId: string) {
    setPoBatchId(nextBatchId);
    const batch = poBatches.find((b) => b.id === nextBatchId);
    // Expected arrival is pulled from the batch — keeps every order in a
    // batch showing the same estimate without re-typing it each time.
    if (batch?.expectedArrivalDate) {
      setExpectedArrivalDate(toDateInputValue(batch.expectedArrivalDate));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerId) {
      setError('Please select a customer.');
      return;
    }
    if (needsPoMonth && !poMonth) {
      setError('PO month is required for PO reguler / remainder orders.');
      return;
    }
    if (items.some((it) => !it.bookTitle.trim())) {
      setError('Every item needs a book title.');
      return;
    }

    const payload: SaveOrderInput = {
      id: order?.id,
      customerId,
      orderType,
      poMonth: needsPoMonth ? poMonth : undefined,
      etaMonth: etaMonth || undefined,
      eventName: orderType === 'EVENT_JASTIP' ? eventName : undefined,
      supplierId: supplierId || null,
      dpType: needsPoMonth ? dpType : undefined,
      dpValue: needsPoMonth ? Number(dpValue) : undefined,
      poBatchId: poBatchId || null,
      orderDate,
      expectedArrivalDate: expectedArrivalDate || undefined,
      actualArrivalDate: actualArrivalDate || undefined,
      status,
      notes,
      items: items.map((it) => ({
        bookId: it.bookId || null,
        bookTitle: it.bookTitle,
        isbn: it.isbn || null,
        format: it.format || null,
        quantity: it.quantity,
        sellingPrice: it.sellingPrice,
        cogs: it.cogs,
        discount: it.discount,
      })),
    };

    startTransition(async () => {
      const result = await saveOrder(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.merged) {
        // Same customer + PO month + order type + supplier as an existing
        // open order — items were appended there instead of a new order.
        router.push(`/admin/orders/${result.orderId}?merged=1`);
      } else {
        router.push(`/admin/orders/${result.orderId}`);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Order details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="customerId">Customer</Label>
            <SearchableSelect
              id="customerId"
              options={customerOptions}
              value={customerId}
              onChange={handleCustomerSelect}
              placeholder="Select a customer…"
              emptyLabel="— None selected —"
            />
            {showNewCustomerForm && (
              <div className="mt-2 space-y-3 rounded-md border border-border bg-secondary/50 p-3">
                <p className="text-sm font-medium">New customer</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="newCustomerName">Name</Label>
                    <Input
                      id="newCustomerName"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="newCustomerPhone">Phone</Label>
                    <Input
                      id="newCustomerPhone"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="newCustomerAddress">Address (optional)</Label>
                    <Input
                      id="newCustomerAddress"
                      value={newCustomerAddress}
                      onChange={(e) => setNewCustomerAddress(e.target.value)}
                      placeholder="Delivery address"
                    />
                  </div>
                </div>
                {newCustomerError && <p className="text-sm text-destructive">{newCustomerError}</p>}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateCustomer}
                    disabled={isCreatingCustomer}
                  >
                    {isCreatingCustomer ? 'Adding…' : 'Add & select this customer'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewCustomerForm(false);
                      setNewCustomerError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="orderType">Order type</Label>
            <Select
              id="orderType"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
            >
              {orderTypeValues.map((t) => (
                <option key={t} value={t}>
                  {orderTypeLabels[t]}
                </option>
              ))}
            </Select>
          </div>

          {orderType === 'EVENT_JASTIP' && (
            <div className="space-y-1.5">
              <Label htmlFor="eventName">Event / jastip name</Label>
              <Input
                id="eventName"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Big Bad Wolf 2026"
              />
            </div>
          )}

          {needsPoMonth && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="poMonth">PO month</Label>
                <Input
                  id="poMonth"
                  type="month"
                  value={poMonth}
                  onChange={(e) => setPoMonth(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="etaMonth">ETA month</Label>
                <Input
                  id="etaMonth"
                  type="month"
                  value={etaMonth}
                  onChange={(e) => setEtaMonth(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplierId">Supplier</Label>
                <SearchableSelect
                  id="supplierId"
                  options={supplierOptions}
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Cari supplier…"
                  emptyLabel="— No supplier —"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dpType">DP rule</Label>
                <Select id="dpType" value={dpType} onChange={(e) => setDpType(e.target.value)}>
                  <option value="PERCENTAGE">Persen dari total</option>
                  <option value="FIXED_PER_BOOK">Rupiah tetap per buku</option>
                  <option value="FIXED_TOTAL">Rupiah tetap total order</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dpValue">
                  {dpType === 'PERCENTAGE' ? 'DP (%)' : 'DP (Rp)'}
                </Label>
                <Input
                  id="dpValue"
                  type="number"
                  min="0"
                  step={dpType === 'PERCENTAGE' ? '1' : '1000'}
                  value={dpValue}
                  onChange={(e) => setDpValue(e.target.value)}
                  required
                />
              </div>
              <div className="rounded-md border border-border bg-secondary/50 p-3 text-xs text-muted-foreground sm:col-span-2">
                Customer, PO month, order type, and supplier that match an existing open order
                will automatically merge into that order&apos;s invoice instead of creating a
                new one.
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="poBatchId">PO Batch (optional)</Label>
            <SearchableSelect
              id="poBatchId"
              options={poBatchOptions}
              value={poBatchId}
              onChange={handleBatchChange}
              placeholder="No batch"
              emptyLabel="— No batch —"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {orderStatusValues.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="orderDate">Order date</Label>
            <Input
              id="orderDate"
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expectedArrivalDate">Expected warehouse arrival</Label>
            <Input
              id="expectedArrivalDate"
              type="date"
              value={expectedArrivalDate}
              onChange={(e) => setExpectedArrivalDate(e.target.value)}
              disabled={!!selectedBatch?.expectedArrivalDate}
            />
            {selectedBatch?.expectedArrivalDate ? (
              <p className="text-xs text-muted-foreground">
                Pulled from &quot;{selectedBatch.name}&quot; — edit the batch to change this for all
                its orders.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="actualArrivalDate">Actual arrival date</Label>
            <Input
              id="actualArrivalDate"
              type="date"
              value={actualArrivalDate}
              onChange={(e) => setActualArrivalDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Book items</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((row) => {
            const subtotal = computeItemSubtotal(row);
            return (
              <div key={row.key} className="rounded-md border border-border p-4">
                <div className="mb-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Book from catalog (optional)</Label>
                    <SearchableSelect
                      options={bookOptions}
                      value={row.bookId}
                      onChange={(v) => handleBookSelect(row.key, v)}
                      placeholder="Custom / not in catalog"
                      emptyLabel="— Custom / not in catalog —"
                    />
                    {!row.bookId && row.bookTitle && (
                      <p className="text-xs text-muted-foreground">
                        Not in catalog yet — saving this order will add it automatically.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Book title</Label>
                    <Input
                      value={row.bookTitle}
                      onChange={(e) => updateItem(row.key, { bookTitle: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>ISBN</Label>
                    <Input value={row.isbn} onChange={(e) => updateItem(row.key, { isbn: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Format</Label>
                    <Select value={row.format} onChange={(e) => updateItem(row.key, { format: e.target.value })}>
                      <option value="">— Not set —</option>
                      {bookFormatValues.map((f) => (
                        <option key={f} value={f}>
                          {bookFormatLabels[f]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => updateItem(row.key, { quantity: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Selling price</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.sellingPrice}
                      onChange={(e) => updateItem(row.key, { sellingPrice: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      COGS <span className="text-muted-foreground">(for reports only)</span>
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.cogs}
                      onChange={(e) => updateItem(row.key, { cogs: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Discount</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.discount}
                      onChange={(e) => updateItem(row.key, { discount: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Subtotal: <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
                  </p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.key)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1.5 pt-6 text-sm">
          <TotalsRow label="Subtotal" value={totals.subtotal} />
          <TotalsRow label="Discount" value={-totals.discountTotal} />
          <TotalsRow label="Total (customer pays)" value={totals.totalAmount} bold />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? 'Saving…' : order ? 'Save changes' : 'Create order'}
        </Button>
      </div>
    </form>
  );
}

function TotalsRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div
      className={
        bold
          ? 'flex justify-between border-t border-border pt-2 text-base font-semibold'
          : 'flex justify-between'
      }
    >
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}
