import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const FAQS = [
  {
    q: 'How do I check my order status?',
    a: 'Go to your dashboard and tap any order to see its current status, expected arrival, and payment history.',
  },
  {
    q: 'What do the order statuses mean?',
    a: 'Waiting = your books haven\u2019t arrived at our warehouse yet. Arrived = they\u2019re in. Ready to Ship = being packed. Shipped = on the way to you, with a tracking number. Completed = delivered.',
  },
  {
    q: 'How do I top up my deposit?',
    a: 'From your dashboard, tap "Top up deposit". Scan the QRIS code, transfer the amount, enter that amount on the page, then tap the button \u2014 it opens WhatsApp with a message ready to send. Attach your transfer screenshot there and send it. We\u2019ll confirm your deposit once we\u2019ve checked it.',
  },
  {
    q: 'How long until my deposit shows up after I top up?',
    a: 'As soon as we confirm your WhatsApp message and the transfer, usually within the same day. You can check your current balance any time from "Deposit balance" on your dashboard.',
  },
  {
    q: 'How do I read my invoice?',
    a: 'Each invoice shows the order it\u2019s for, the items, the order total, how much you\u2019ve paid so far, what\u2019s still outstanding, and the amount this specific invoice is asking for. You can print it, save it as an image, or share it straight to WhatsApp from the invoice page.',
  },
  {
    q: 'What\u2019s the difference between a Deposit, Final Payment, and Ready Stock invoice?',
    a: 'Deposit = a partial payment to start your pre-order. Final Payment (Pelunasan) = settling the remaining balance once your books are confirmed. Ready Stock = full payment for books already in stock, no pre-order wait.',
  },
  {
    q: 'How do I know when it\u2019s my turn to be packed?',
    a: 'Once your order has at least one payment recorded, its order page shows your position in the packing queue \u2014 we pack in the order payments come in, so nothing gets skipped.',
  },
  {
    q: 'I moved \u2014 how do I update my address?',
    a: 'From your dashboard, tap "Update address" on your profile card. Submit your new address; it\u2019ll show as pending until we confirm it, then it updates everywhere.',
  },
  {
    q: 'Still have a question?',
    a: 'Just message us on WhatsApp \u2014 we\u2019re happy to help.',
  },
];

export default function PortalFaqPage() {
  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/portal/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        <h1 className="mb-1 font-display text-2xl font-semibold text-primary">
          Frequently asked questions
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Quick answers so you don&apos;t have to wait on WhatsApp for the basics.
        </p>

        <div className="space-y-3">
          {FAQS.map((item, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.q}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.a}</CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
