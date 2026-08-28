import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const isbn = request.nextUrl.searchParams.get('isbn')?.trim();
  if (!isbn) return NextResponse.json({ error: 'ISBN required' }, { status: 400 });

  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`
    );
    if (!res.ok) return NextResponse.json({ found: false });

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return NextResponse.json({ found: false });

    const info = item.volumeInfo ?? {};
    return NextResponse.json({
      found: true,
      title: info.title ?? null,
      author: Array.isArray(info.authors) ? info.authors.join(', ') : null,
      publisher: info.publisher ?? null,
      thumbnail: info.imageLinks?.thumbnail?.replace('http://', 'https://') ?? null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ found: false });
  }
}
