'use client';

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
};

function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

export function PoBatchForm({
  action,
  batch,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  batch?: Batch;
}) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Batch name</Label>
        <Input id="name" name="name" defaultValue={batch?.name} placeholder="e.g. Fast PO — July Batch 2" required />
        <FieldError errors={state?.errors?.name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="type">Type</Label>
        <Select id="type" name="type" defaultValue={batch?.type ?? 'PO_REGULAR'} required>
          <option value="PO_REGULAR">PO Reguler</option>
          <option value="PO_REMAINDER">PO Remainder</option>
          <option value="READY_STOCK">Ready Stock</option>
          <option value="EVENT_JASTIP">Event / Jastip</option>
        </Select>
        <FieldError errors={state?.errors?.type} />
      </div>

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
            type="date"
            defaultValue={toDateInputValue(batch?.expectedArrivalDate)}
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
