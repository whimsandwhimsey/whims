'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QrisDisplay } from '@/components/qris-display';
import { requestTopUp } from '../actions';

// Admin's WhatsApp number, in wa.me format (country code, no +, no spaces).
const ADMIN_WHATSAPP = '6285121567309';

export default function PortalTopUpPage() {
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('amount', amount);
      const result = await requestTopUp(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSubmitted(true);

      const text = encodeURIComponent(
        `Hi admin, aku sudah transfer top up deposit sebanyak Rp${numericAmount.toLocaleString('id-ID')}. Ini bukti transfernya ya 🙏`
      );
      window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${text}`, '_blank');
    });
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-sm">
        <Link
          href="/portal/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to your orders
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Top up your deposit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <QrisDisplay />

            <div className="space-y-1.5">
              <Label htmlFor="amount">How much did you transfer?</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="e.g. 100000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {submitted ? (
              <p className="rounded-md bg-success/10 p-3 text-sm text-success">
                Sent! We&apos;ve also opened WhatsApp for you — just hit send there and attach your
                transfer receipt. We&apos;ll confirm your deposit once we&apos;ve checked it.
              </p>
            ) : (
              <form onSubmit={handleSubmit}>
                <Button type="submit" className="w-full" disabled={isPending}>
                  <MessageCircle className="h-4 w-4" />
                  {isPending ? 'Submitting…' : "I've transferred — notify admin"}
                </Button>
              </form>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Scan the QRIS above, transfer the amount you entered, then tap the button — we&apos;ll
              open WhatsApp with a message ready to go. Just attach your transfer screenshot there
              and send.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
