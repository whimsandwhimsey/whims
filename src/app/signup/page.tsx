'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requestCustomerSignup } from './actions';

export default function SignupPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [alreadyPending, setAlreadyPending] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await requestCustomerSignup(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setAlreadyPending(result.status === 'already-pending');
      setSubmitted(true);
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-2 flex justify-center">
            <Logo />
          </div>
          {!submitted && (
            <>
              <CardTitle className="font-display text-xl font-bold">Create your account</CardTitle>
              <CardDescription>
                Just a few details — we&apos;ll review your request and let you know once it&apos;s
                approved.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p className="font-medium">
                {alreadyPending ? 'You already have a request pending.' : 'Thanks! Your request has been submitted.'}
              </p>
              <p className="text-sm text-muted-foreground">
                We&apos;ll review it and reach out once your account is approved. You can try signing
                in after that.
              </p>
              <Button asChild variant="outline" className="mt-2">
                <Link href="/">Back to home</Link>
              </Button>
            </div>
          ) : (
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="08xx xxxx xxxx" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" name="address" rows={3} />
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? 'Submitting…' : 'Submit request'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already registered?{' '}
                <Link href="/login/customer" className="font-medium text-primary underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
