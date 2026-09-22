'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setSupplierInvoiceUrl, removeSupplierInvoice } from './actions';

export function SupplierInvoiceUpload({
  batchId,
  currentUrl,
}: {
  batchId: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('batchId', batchId);
      const res = await fetch('/api/upload/supplier-invoice', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Upload gagal.');
        return;
      }
      startTransition(async () => {
        await setSupplierInvoiceUrl(batchId, data.url);
        router.refresh();
      });
    } catch (err) {
      console.error(err);
      setError('Upload gagal. Coba lagi.');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  if (currentUrl) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <FileText className="h-4 w-4" /> Lihat invoice supplier <ExternalLink className="h-3 w-3" />
        </a>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await removeSupplierInvoice(batchId);
              router.refresh();
            })
          }
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" /> {isUploading ? 'Uploading…' : 'Upload invoice supplier'}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <p className="mt-1 text-xs text-muted-foreground">PDF atau gambar, maks 15MB.</p>
    </div>
  );
}
