'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '../customers/actions';

type Publisher = {
  id: string;
  name: string;
  notes: string | null;
};

export function PublisherForm({
  action,
  publisher,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  publisher?: Publisher;
}) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nama publisher</Label>
        <Input id="name" name="name" defaultValue={publisher?.name} required />
        <FieldError errors={state?.errors?.name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Catatan</Label>
        <Textarea id="notes" name="notes" defaultValue={publisher?.notes ?? ''} rows={3} />
      </div>

      <SubmitButton isEdit={!!publisher} />
    </form>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Menyimpan…' : isEdit ? 'Simpan perubahan' : 'Tambah publisher'}
    </Button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}
