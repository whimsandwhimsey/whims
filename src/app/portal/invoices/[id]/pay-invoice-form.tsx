'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QrisDisplay } from '@/components/qris-display';
import { formatCurrency } from '@/lib/utils';
import { requestInvoicePayment } from '../../actions';

// Admin's WhatsApp number, in wa.me format (country code, no +, no spaces).
const ADMIN_WHATSAPP = '6285121567309';

export function PayInvoiceForm({
  invoiceId,
  invoiceNumber,
  outstanding,
  hasPendingRequest,
}: {
  invoiceId: string;
  invoiceNumber: string;
  outstanding: number;
  hasPendingRequest: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(String(outstanding));
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (outstanding <= 0) return null;

  if (hasPendingRequest || submitted) {
    return (
      <Card className="border-brass/40 bg-brass/5 print:hidden">
        <CardContent className="pt-6 text-center text-sm text-brass">
          Menunggu konfirmasi admin — klaim pembayaran kamu udah kami terima, tinggal dicek dan
          dikonfirmasi. Kalau belum kirim bukti transfer via WhatsApp, jangan lupa ya 🙏
        </CardContent>
      </Card>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError('Masukkan jumlah yang valid.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('invoiceId', invoiceId);
      formData.set('amount', amount);
      const result = await requestInvoicePayment(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
      router.refresh();

      const text = encodeURIComponent(
        `Hi admin, aku sudah transfer buat invoice ${invoiceNumber} sebanyak Rp${numericAmount.toLocaleString('id-ID')}. Ini bukti transfernya ya 🙏`
      );
      window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${text}`, '_blank');
    });
  }

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="text-base">Bayar invoice ini</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <QrisDisplay />

        <div className="space-y-1.5">
          <Label htmlFor="pay-amount">Berapa yang kamu transfer?</Label>
          <Input
            id="pay-amount"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Outstanding: {formatCurrency(outstanding)}</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <form onSubmit={handleSubmit}>
          <Button type="submit" className="w-full" disabled={isPending}>
            <MessageCircle className="h-4 w-4" />
            {isPending ? 'Mengirim…' : 'Sudah transfer — kabari admin'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Scan QRIS di atas, transfer sesuai jumlah yang kamu isi, lalu tap tombol — WhatsApp bakal
          kebuka otomatis, tinggal lampirin bukti transfer dan kirim.
        </p>
      </CardContent>
    </Card>
  );
}
