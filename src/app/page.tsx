import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo priority className="max-w-[260px]" />
        </div>

        <Card className="mb-4 border-2 border-primary/15 shadow-sm">
          <CardContent className="space-y-4 pt-6 text-center">
            <div>
              <h1 className="font-display text-xl font-bold text-primary">Track your order</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in with your phone number to see your orders, payments, and deposit balance.
              </p>
            </div>
            <Button asChild size="lg" className="w-full">
              <Link href="/login/customer">Sign in with phone number</Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              New here?{' '}
              <Link href="/signup" className="font-medium text-primary underline underline-offset-4">
                Sign up
              </Link>
            </p>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link
            href="/login/admin"
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Staff login
          </Link>
        </div>
      </div>
    </main>
  );
}
