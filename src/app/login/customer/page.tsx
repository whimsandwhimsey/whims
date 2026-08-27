'use client';

import { useState, Suspense } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function CustomerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/portal/dashboard';

  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Clear any stale session first — prevents leftover staff/customer
      // session state from interfering when switching account types on the
      // same device/browser.
      await signOut({ redirect: false });

      const res = await signIn('customer-login', { phone, redirect: false });

      if (res?.error) {
        setError(
          "We couldn't sign you in with that phone number. It may not be registered yet, or your signup request may still be waiting for approval."
        );
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Something went wrong while signing in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mb-2 flex justify-center">
          <Logo />
        </div>
        <CardTitle className="font-display text-2xl">Track your order</CardTitle>
        <CardDescription>Enter the phone number on file with your order.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              placeholder="08xx xxxx xxxx"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoFocus
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Checking…' : 'Continue'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/signup" className="font-medium text-primary underline underline-offset-4">
            Sign up
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Staff member?{' '}
          <Link href="/login/admin" className="text-primary underline underline-offset-4">
            Sign in here
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function CustomerLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Suspense fallback={null}>
        <CustomerLoginForm />
      </Suspense>
    </main>
  );
}
