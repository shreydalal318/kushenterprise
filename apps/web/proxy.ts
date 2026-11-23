import { NextResponse, type NextRequest } from 'next/server';

// Fast redirect for signed-out visitors. Real authorisation happens in server layouts and the API.
export function proxy(req: NextRequest) {
  if (!req.cookies.has('ke_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*', '/portal/:path*', '/change-password'] };
