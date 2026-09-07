'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { createStaffAccount } from './actions';

export function NewStaffForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await createStaffAccount(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
      (document.getElementById('new-staff-form') as HTMLFormElement | null)?.reset();
    });
  }

  return (
    <form id="new-staff-form" action={handleSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nama</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" required placeholder="buat login" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password awal</Label>
        <Input id="password" name="password" type="text" required minLength={8} placeholder="min. 8 karakter" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="role">Role</Label>
        <Select id="role" name="role" defaultValue="STAFF">
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Admin</option>
        </Select>
      </div>
      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      {success && <p className="text-sm text-success sm:col-span-2">Akun berhasil dibuat.</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Membuat…' : 'Buat akun'}
        </Button>
      </div>
    </form>
  );
}
