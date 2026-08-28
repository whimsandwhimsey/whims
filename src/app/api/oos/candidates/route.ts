import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/session';
import { findOosCandidates } from '../../../admin/oos/actions';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const bookId = request.nextUrl.searchParams.get('bookId');
  const batchId = request.nextUrl.searchParams.get('batchId') ?? undefined;
  if (!bookId) return NextResponse.json({ ids: [] });

  const items = await findOosCandidates(bookId, batchId);
  return NextResponse.json({ ids: items.map((i) => i.id) });
}
