import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireStaffSession } from '@/lib/guards';

export async function POST(req: NextRequest) {
  const session = await requireStaffSession().catch(() => null);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file');
  const batchId = formData.get('batchId');

  if (!(file instanceof File) || typeof batchId !== 'string') {
    return NextResponse.json({ error: 'Missing file or batchId' }, { status: 400 });
  }

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF or image files are allowed.' }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 15MB).' }, { status: 400 });
  }

  try {
    const ext = file.name.split('.').pop() || 'pdf';
    const blob = await put(`supplier-invoices/${batchId}-${Date.now()}.${ext}`, file, {
      access: 'public',
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}
