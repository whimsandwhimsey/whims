'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { importCustomersFromExcel, type ImportResult } from './actions';

export function ImportCustomersForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await importCustomersFromExcel(formData);
      setResult(res);
      formRef.current?.reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Upload className="h-4 w-4" /> Import from Excel
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-border p-4 sm:w-auto">
      <form ref={formRef} action={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="import-file" className="text-sm font-medium">
            .xlsx file with &quot;Name&quot; and &quot;Phone&quot; columns
          </label>
          <Input id="import-file" name="file" type="file" accept=".xlsx" required />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Importing…' : 'Upload'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </form>

      {result && (
        <div className="mt-3 text-sm">
          <p className="font-medium">
            {result.created} created, {result.skipped} skipped.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
