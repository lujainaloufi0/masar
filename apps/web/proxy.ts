import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs on the server before every request.
 * 1. Forwards /api and /socket.io to the API, so the browser only ever talks to one origin
 *    (cookies stay first-party). This reads API_INTERNAL_URL at runtime, unlike next.config
 *    rewrites, which are fixed when the app is built.
 * 2. Sends visitors without a session to the sign-in page before any app page renders.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith('/api/') || pathname === '/socket.io' || pathname.startsWith('/socket.io/')) {
    let api = process.env.API_INTERNAL_URL || 'http://localhost:4000';
    if (!/^https?:\/\//.test(api)) api = `http://${api}`; // hosts such as Render hand out "host:port"

    return NextResponse.rewrite(new URL(pathname + search, api));
  }

  const signedIn = req.cookies.has('masar_session');
  if (pathname === '/login') return signedIn ? NextResponse.redirect(new URL('/overview', req.url)) : NextResponse.next();
  if (!signedIn) return NextResponse.redirect(new URL('/login', req.url));
  if (pathname === '/') return NextResponse.redirect(new URL('/overview', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/socket.io', '/((?!_next|favicon|icon|.*\\..*).*)'],
};
