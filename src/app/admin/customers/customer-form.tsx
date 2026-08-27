'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from './actions';

type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
};

export function CustomerForm({
  action,
  customer,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  customer?: Customer;
}) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={customer?.name} required />
        <FieldError errors={state?.errors?.name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <Input id="phone" name="phone" defaultValue={customer?.phone} required placeholder="08xx xxxx xxxx" />
        <FieldError errors={state?.errors?.phone} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" name="address" defaultValue={customer?.address ?? ''} rows={3} />
        <FieldError errors={state?.errors?.address} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ''} rows={3} />
        <FieldError errors={state?.errors?.notes} />
      </div>

      <SubmitButton isEdit={!!customer} />
    </form>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
    </Button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}
