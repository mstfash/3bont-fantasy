import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  const locale =
    request.nextUrl.pathname === '/brand' ||
    request.nextUrl.pathname.split('/')[1] === 'en'
      ? 'en'
      : 'ar';
  // Overwrite user input; this header only controls presentation, never access.
  headers.set('x-fantasy-locale', locale);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/ar/:path*', '/en/:path*', '/brand'] };
