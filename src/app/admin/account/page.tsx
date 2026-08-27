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
