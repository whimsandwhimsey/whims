'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect, type ComboboxOption } from '@/components/searchable-select';
import { bookFormatValues, bookFormatLabels } from '@/lib/validations';
import { useState } from 'react';
import type { FormState } from '../customers/actions';

type Book = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  format: string | null;
  publisherId: string | null;
  notes: string | null;
};

export function BookForm({
  action,
  book,
  publisherOptions,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  book?: Book;
  publisherOptions: ComboboxOption[];
}) {
  const [state, formAction] = useFormState(action, null);
  const [publisherId, setPublisherId] = useState(book?.publisherId ?? '');

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={book?.title} required />
        <FieldError errors={state?.errors?.title} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="author">Author</Label>
        <Input id="author" name="author" defaultValue={book?.author ?? ''} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="isbn">ISBN</Label>
          <Input id="isbn" name="isbn" defaultValue={book?.isbn ?? ''} />
          <FieldError errors={state?.errors?.isbn} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="format">Format</Label>
          <Select id="format" name="format" defaultValue={book?.format ?? ''}>
            <option value="">— Not set —</option>
            {bookFormatValues.map((f) => (
              <option key={f} value={f}>
                {bookFormatLabels[f]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="publisherId">Publisher</Label>
        <input type="hidden" name="publisherId" value={publisherId} />
        <SearchableSelect
          id="publisherId"
          options={publisherOptions}
          value={publisherId}
          onChange={setPublisherId}
          placeholder="Cari publisher…"
          emptyLabel="— Belum ada publisher —"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={book?.notes ?? ''} rows={3} />
      </div>

      <SubmitButton isEdit={!!book} />
    </form>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add book'}
    </Button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}
