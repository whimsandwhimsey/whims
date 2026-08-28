import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/session';

type LookupResult = {
  found: boolean;
  title?: string | null;
  author?: string | null;
  publisher?: string | null;
  thumbnail?: string | null;
  source?: 'google' | 'openlibrary';
};

async function lookupGoogleBooks(isbn: string): Promise<LookupResult> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`
    );
    if (!res.ok) return { found: false };

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return { found: false };

    const info = item.volumeInfo ?? {};
    return {
      found: true,
      title: info.title ?? null,
      author: Array.isArray(info.authors) ? info.authors.join(', ') : null,
      publisher: info.publisher ?? null,
      thumbnail: info.imageLinks?.thumbnail?.replace('http://', 'https://') ?? null,
      source: 'google',
    };
  } catch (err) {
    console.error('Google Books lookup failed', err);
    return { found: false };
  }
}

/** Fallback source — different coverage from Google Books (Internet
 * Archive-backed), catches titles Google Books doesn't have, e.g. some UK
 * novelty/board book publishers like Usborne. */
async function lookupOpenLibrary(isbn: string): Promise<LookupResult> {
  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`
    );
    if (!res.ok) return { found: false };

    const data = await res.json();
    const item = data[`ISBN:${isbn}`];
    if (!item) return { found: false };

    return {
      found: true,
      title: item.title ?? null,
      author: Array.isArray(item.authors) ? item.authors.map((a: any) => a.name).join(', ') : null,
      publisher: Array.isArray(item.publishers) ? item.publishers[0]?.name ?? null : null,
      thumbnail: item.cover?.medium ?? item.cover?.small ?? null,
      source: 'openlibrary',
    };
  } catch (err) {
    console.error('Open Library lookup failed', err);
    return { found: false };
  }
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const isbn = request.nextUrl.searchParams.get('isbn')?.trim();
  if (!isbn) return NextResponse.json({ error: 'ISBN required' }, { status: 400 });

  const googleResult = await lookupGoogleBooks(isbn);
  if (googleResult.found) return NextResponse.json(googleResult);

  const openLibraryResult = await lookupOpenLibrary(isbn);
  return NextResponse.json(openLibraryResult);
}
