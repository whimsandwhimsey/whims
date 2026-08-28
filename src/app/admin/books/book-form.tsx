'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect, type ComboboxOption } from '@/components/searchable-select';
import { bookFormatValues, bookFormatLabels } from '@/lib/validations';
import type { FormState } from '../customers/actions';

type Book = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  format: string | null;
  weightGrams: number | null;
  imageUrl: string | null;
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
  const [title, setTitle] = useState(book?.title ?? '');
  const [author, setAuthor] = useState(book?.author ?? '');
  const [isbn, setIsbn] = useState(book?.isbn ?? '');
  const [weightGrams, setWeightGrams] = useState(book?.weightGrams ? String(book.weightGrams) : '');
  const [imageUrl, setImageUrl] = useState(book?.imageUrl ?? '');
  const [isLooking, setIsLooking] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  async function handleLookup() {
    if (!isbn.trim()) return;
    setIsLooking(true);
    setLookupNote(null);
    try {
      const res = await fetch(`/api/books/lookup-isbn?isbn=${encodeURIComponent(isbn.trim())}`);
      const data = await res.json();
      if (!data.found) {
        setLookupNote('Gak ketemu data buat ISBN ini — isi manual aja.');
        return;
      }
      if (data.title) setTitle(data.title);
      if (data.author) setAuthor(data.author);
      if (data.thumbnail) setImageUrl(data.thumbnail);

      if (data.publisher) {
        const match = publisherOptions.find(
          (p) => p.label.toLowerCase() === data.publisher.toLowerCase()
        );
        if (match) {
          setPublisherId(match.value);
          setLookupNote('Judul, author, dan publisher ke-isi otomatis. Berat tetap perlu diisi manual (timbang fisik bukunya).');
        } else {
          setLookupNote(
            `Judul & author ke-isi otomatis. Publisher terdeteksi "${data.publisher}" tapi belum ada di database — tambahin dulu di Database → Publishers, baru pilih di sini. Berat tetap perlu diisi manual.`
          );
        }
      } else {
        setLookupNote('Judul & author ke-isi otomatis. Publisher gak ketemu — pilih manual. Berat tetap perlu diisi manual.');
      }
    } catch {
      setLookupNote('Gagal cari data — coba lagi atau isi manual.');
    } finally {
      setIsLooking(false);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="isbn">ISBN</Label>
        <div className="flex gap-2">
          <Input
            id="isbn"
            name="isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="978-602-xxxxx"
          />
          <Button type="button" variant="outline" onClick={handleLookup} disabled={isLooking || !isbn.trim()}>
            {isLooking ? 'Nyari…' : 'Cari via ISBN'}
          </Button>
        </div>
        <FieldError errors={state?.errors?.isbn} />
        {lookupNote && <p className="text-xs text-brass">{lookupNote}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <FieldError errors={state?.errors?.title} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="author">Author</Label>
        <Input id="author" name="author" value={author} onChange={(e) => setAuthor(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
        <div className="space-y-1.5">
          <Label htmlFor="weightGrams">Berat (gram)</Label>
          <Input
            id="weightGrams"
            name="weightGrams"
            type="number"
            min="0"
            value={weightGrams}
            onChange={(e) => setWeightGrams(e.target.value)}
            placeholder="Timbang fisik bukunya"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="imageUrl">Cover image URL</Label>
        <div className="flex items-start gap-3">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-20 w-14 shrink-0 rounded border border-border object-cover" />
          )}
          <Input
            id="imageUrl"
            name="imageUrl"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Otomatis dari ISBN, atau paste URL sendiri"
            className="flex-1"
          />
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
