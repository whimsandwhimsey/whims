'use client';

import { useState } from 'react';
import { MessageCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QrisDisplay } from '@/components/qris-display';
import { formatCurrency } from '@/lib/utils';

// Admin's WhatsApp number, in wa.me format (country code, no +, no spaces).
const ADMIN_WHATSAPP = '628561222325';

export function PayOngkirButton({ customerName, outstanding }: { customerName: string; outstanding: number }) {
  const [open, setOpen] = useState(false);
  if (outstanding <= 0) return null;

  function confirm() {
    const text = encodeURIComponent(
      `Hi admin, aku (${customerName}) sudah transfer ongkir sebesar Rp${outstanding.toLocaleString('id-ID')}. Ini bukti transfernya ya 🙏`
    );
    window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${text}`, '_blank');
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
      >
        Bayar ongkir sekarang
        <ChevronDown className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <QrisDisplay />
      <p className="text-center text-sm">
        Transfer <span className="font-semibold">{formatCurrency(outstanding)}</span>, lalu tap tombol di
        bawah buat kabarin admin.
      </p>
      <Button onClick={confirm} className="w-full">
        <MessageCircle className="h-4 w-4" /> Sudah transfer — kabari admin
      </Button>
    </div>
  );
}
