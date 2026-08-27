import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PoBatchForm } from '../po-batch-form';
import { createPoBatch } from '../actions';

export default function NewPoBatchPage() {
  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/admin/po-batches"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to PO batches
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New PO batch</CardTitle>
        </CardHeader>
        <CardContent>
          <PoBatchForm action={createPoBatch} />
        </CardContent>
      </Card>
    </div>
  );
}
