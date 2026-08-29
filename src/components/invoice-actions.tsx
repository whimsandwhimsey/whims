'use client';

import { useState } from 'react';
import { Printer, Download, Share2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import type { InvoiceDocumentData } from '@/components/invoice-document';
import { markInvoiceSent } from '@/app/admin/invoices/actions';

const TYPE_LABELS: Record<InvoiceDocumentData['type'], string> = {
  DEPOSIT: 'Deposit Invoice',
  FINAL_PAYMENT: 'Final Payment Invoice',
  READY_STOCK: 'Ready Stock Invoice',
};

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function buildWhatsAppText(data: InvoiceDocumentData): string {
  const lines = [
    `Hi kak ${firstName(data.customer.name)}, ini invoice ${TYPE_LABELS[data.type]} buat order ${data.order.orderNumber} ya 📚`,
    '',
    `Tagihan: ${formatCurrency(data.amount)}`,
    'Detail item & QRIS pembayaran ada di gambar invoice-nya.',
    '',
    'Ada pertanyaan, langsung balas chat ini aja. Makasih! 🐈‍⬛',
  ];
  return lines.join('\n');
}

export function InvoiceActions({
  data,
  targetElementId,
  whatsappPhone,
  invoiceId,
}: {
  data: InvoiceDocumentData;
  targetElementId: string;
  /** Customer's phone in wa.me format (digits only, country code, no +). Omit to hide the WhatsApp button. */
  whatsappPhone?: string;
  /** When provided (admin view only), sending/sharing auto-marks the invoice as sent. */
  invoiceId?: string;
}) {
  const [isExporting, setIsExporting] = useState(false);

  async function tryMarkSent() {
    if (!invoiceId) return;
    try {
      await markInvoiceSent(invoiceId, true);
    } catch {
      // Non-critical — worst case the admin flips the "Sent" toggle manually.
    }
  }

  async function captureImage(): Promise<Blob | null> {
    const el = document.getElementById(targetElementId);
    if (!el) return null;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 });
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  async function handleDownloadImage() {
    setIsExporting(true);
    try {
      const blob = await captureImage();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.invoiceNumber}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleShareImage() {
    setIsExporting(true);
    try {
      const blob = await captureImage();
      if (!blob) return;
      const file = new File([blob], `${data.invoiceNumber}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: data.invoiceNumber,
          text: `${TYPE_LABELS[data.type]} — ${data.invoiceNumber}`,
        });
        await tryMarkSent();
      }
    } catch {
      // User cancelled the share sheet — not an error worth surfacing.
    } finally {
      setIsExporting(false);
    }
  }

  async function handleWhatsAppText() {
    if (!whatsappPhone) return;
    const text = encodeURIComponent(buildWhatsAppText(data));
    window.open(`https://wa.me/${whatsappPhone}?text=${text}`, '_blank');
    await tryMarkSent();
  }

  const shareSupported =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-2 print:hidden">
      <Button className="w-full" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </Button>

      {whatsappPhone && (
        <Button variant="outline" className="w-full" onClick={handleWhatsAppText}>
          <MessageCircle className="h-4 w-4" /> Send via WhatsApp (text)
        </Button>
      )}

      {shareSupported && (
        <Button variant="outline" className="w-full" onClick={handleShareImage} disabled={isExporting}>
          <Share2 className="h-4 w-4" /> {isExporting ? 'Preparing…' : 'Share as image (WhatsApp, etc.)'}
        </Button>
      )}

      <Button variant="outline" className="w-full" onClick={handleDownloadImage} disabled={isExporting}>
        <Download className="h-4 w-4" /> {isExporting ? 'Preparing…' : 'Download as image'}
      </Button>
    </div>
  );
}
