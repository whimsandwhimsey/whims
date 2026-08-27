import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const isAdminPath = pathname.startsWith('/admin');
  const isPortalPath = pathname.startsWith('/portal');

  if (isAdminPath) {
    if (!token || token.accountType !== 'STAFF') {
      const url = new URL('/login/admin', req.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (isPortalPath) {
    if (!token || token.accountType !== 'CUSTOMER') {
      const url = new URL('/login/customer', req.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*'],
};
