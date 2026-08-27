'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { approveCustomer } from './actions';

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/**
 * Approves the signup, then opens WhatsApp with a friendly "you're
 * confirmed" message pre-filled — one tap after approving instead of
 * writing it out by hand every time.
 */
export function ApproveCustomerButton({
  customerId,
  customerName,
  customerPhone,
}: {
  customerId: string;
  customerName: string;
  customerPhone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      await approveCustomer(customerId);

      const text = encodeURIComponent(
        `Hi, kak ${firstName(customerName)}! Makasih udah daftar di Whims & Whimsey 📚 Akun kamu udah kami confirm — sekarang kamu udah bisa login dan cek pesanan kamu di portal ya. Selamat belanja & happy reading! 🐈‍⬛`
      );
      window.open(`https://wa.me/${customerPhone}?text=${text}`, '_blank');
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title="Approve & notify via WhatsApp"
      onClick={handleApprove}
      disabled={isPending}
    >
      <Check className="h-4 w-4 text-success" />
    </Button>
  );
}
