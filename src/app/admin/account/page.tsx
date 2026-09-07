import Link from 'next/link';
import { Users } from 'lucide-react';
import { getAuthSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChangePasswordForm } from './change-password-form';

export default async function AccountSettingsPage() {
  const session = await getAuthSession();

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-primary">Account settings</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {session?.user?.name} ({session?.user?.role})
        </p>
      </div>

      {session?.user?.role === 'ADMIN' && (
        <Link href="/admin/account/staff" className="mb-6 block max-w-md">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="rounded-md bg-secondary p-2.5">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Staff accounts</p>
                <p className="text-xs text-muted-foreground">Tambah login baru, reset password, atau nonaktifin staff</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>You&apos;ll need your current password to set a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
