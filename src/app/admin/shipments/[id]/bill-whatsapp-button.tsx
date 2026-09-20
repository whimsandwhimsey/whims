'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BillShippingWhatsAppButton({
  customerName,
  customerPhone,
  trackingNumber,
  shippingCost,
}: {
  customerName: string;
  customerPhone: string;
  trackingNumber: string | null;
  shippingCost: number;
}) {
  const resiText = trackingNumber ? `resi ${trackingNumber}` : 'pesanan kamu';
  const text = encodeURIComponent(
    `Halo kak ${customerName}, mohon bantu bayar ongkir buat ${resiText} sebesar Rp${shippingCost.toLocaleString('id-ID')} ya. Makasih! 🐈‍⬛`
  );
  const phone = customerPhone.replace(/[^0-9]/g, '');

  return (
    <Button asChild variant="outline" size="sm">
      <a href={`https://wa.me/${phone}?text=${text}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="h-4 w-4" /> Tagih ongkir via WA
      </a>
    </Button>
  );
}
