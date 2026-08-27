import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PublisherForm } from '../publisher-form';
import { createPublisher } from '../actions';

export default function NewPublisherPage() {
  return (
    <div className="p-6">
      <Link
        href="/admin/publishers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to publishers
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Tambah publisher</CardTitle>
        </CardHeader>
        <CardContent>
          <PublisherForm action={createPublisher} />
        </CardContent>
      </Card>
    </div>
  );
}
