'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { requestAddressChange } from '../../actions';

export function EditAddressForm({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await requestAddressChange(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="newAddress">New address</Label>
        <Textarea id="newAddress" name="newAddress" rows={3} defaultValue={defaultValue} required />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {submitted && (
        <p className="text-sm text-success">Submitted! Waiting for the store to confirm it.</p>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Submitting…' : 'Submit for confirmation'}
      </Button>
    </form>
  );
}
