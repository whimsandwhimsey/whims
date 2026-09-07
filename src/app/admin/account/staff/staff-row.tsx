'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resetStaffPassword, toggleStaffActive } from './actions';

type StaffUser = {
  id: string;
  name: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAtLabel: string;
};

export function StaffRow({ user, isSelf }: { user: StaffUser; isSelf: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleReset() {
    if (!newPassword || newPassword.length < 8) {
      setError('Password minimal 8 karakter.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('newPassword', newPassword);
      const result = await resetStaffPassword(user.id, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setResetting(false);
      setNewPassword('');
      router.refresh();
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      await toggleStaffActive(user.id, !user.isActive);
      router.refresh();
    });
  }

  return (
    <div className={`rounded-md border p-3 ${user.isActive ? 'border-border' : 'border-border bg-muted/40'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {user.name} {isSelf && <span className="text-xs text-muted-foreground">(kamu)</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            @{user.username} · {user.role === 'ADMIN' ? 'Admin' : 'Staff'} · Dibuat {user.createdAtLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              user.isActive ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
            }`}
          >
            {user.isActive ? 'Active' : 'Nonaktif'}
          </span>
          <Button size="sm" variant="outline" onClick={() => setResetting((v) => !v)}>
            Reset password
          </Button>
          {!isSelf && (
            <Button size="sm" variant={user.isActive ? 'outline' : 'default'} onClick={handleToggleActive} disabled={isPending}>
              {user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          )}
        </div>
      </div>

      {resetting && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Input
            type="text"
            placeholder="Password baru (min. 8 karakter)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-56"
          />
          <Button size="sm" onClick={handleReset} disabled={isPending}>
            {isPending ? 'Menyimpan…' : 'Simpan'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setResetting(false)}>
            Batal
          </Button>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
