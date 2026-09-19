'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from './actions';

type Batch = {
  id: string;
  name: string;
  type: string;
  batchDate: Date;
  expectedArrivalDate: Date | null;
  notes: string | null;
  dpType: string | null;
  dpValue: unknown;
  supplierId: string | null;
};

type Supplier = { id: string; name: string };

function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

export function PoBatchForm({
  action,
  batch,
  suppliers,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  batch?: Batch;
  suppliers: Supplier[];
}) {
  const [state, formAction] = useFormState(action, null);
  const [type, setType] = useState(batch?.type ?? 'PO_REGULAR');
  const [dpType, setDpType] = useState(batch?.dpType ?? 'PERCENTAGE');
  const isPoType = type === 'PO_REGULAR' || type === 'PO_REMAINDER';
  const hasOrders = !!batch; // editing an existing batch — changing DP here affects every order already in it

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nama PO</Label>
        <Input
          id="name"
          name="name"
          defaultValue={batch?.name}
          placeholder="e.g. PO UK — Usborne, DK Books"
          required
        />
        <p className="text-xs text-muted-foreground">
          Ini yang keliatan sama customer di portal mereka — bebas kasih nama apa aja (negara, publisher,
          dll). Supplier di bawah cuma buat internal, gak ditampilin ke customer.
        </p>
        <FieldError errors={state?.errors?.name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="supplierId">Supplier (internal aja)</Label>
        <Select id="supplierId" name="supplierId" defaultValue={batch?.supplierId ?? ''}>
          <option value="">— Belum ada —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="type">Type</Label>
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} required>
          <option value="PO_REGULAR">PO Reguler</option>
          <option value="PO_REMAINDER">PO Remainder</option>
          <option value="READY_STOCK">Ready Stock</option>
          <option value="EVENT_JASTIP">Event / Jastip</option>
        </Select>
        <FieldError errors={state?.errors?.type} />
      </div>

      {isPoType && (
        <div className="grid gap-4 rounded-md border border-border p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dpType">DP rule</Label>
            <Select id="dpType" name="dpType" value={dpType} onChange={(e) => setDpType(e.target.value)}>
              <option value="PERCENTAGE">Persen dari total</option>
              <option value="FIXED_PER_BOOK">Rupiah tetap per buku</option>
              <option value="FIXED_TOTAL">Rupiah tetap total order</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dpValue">{dpType === 'PERCENTAGE' ? 'DP (%)' : 'DP (Rp)'}</Label>
            <Input
              id="dpValue"
              name="dpValue"
              type="number"
              min="0"
              step={dpType === 'PERCENTAGE' ? '1' : '1000'}
              defaultValue={
                batch?.dpValue !== null && batch?.dpValue !== undefined ? String(batch.dpValue) : '25'
              }
            />
          </div>
          {hasOrders && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Ubah DP di sini bakal ikut ngubah DP di SEMUA order yang udah ada di batch ini.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="batchDate">Batch date</Label>
          <Input
            id="batchDate"
            name="batchDate"
            type="date"
            defaultValue={toDateInputValue(batch?.batchDate) || new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expectedArrivalDate">Expected arrival</Label>
          <Input
            id="expectedArrivalDate"
            name="expectedArrivalDate"
            type="month"
            defaultValue={batch?.expectedArrivalDate ? new Date(batch.expectedArrivalDate).toISOString().slice(0, 7) : ''}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={batch?.notes ?? ''} rows={3} />
      </div>

      <SubmitButton isEdit={!!batch} />
    </form>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create batch'}
    </Button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}
