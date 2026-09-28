import { NextResponse, type NextRequest } from 'next/server';

/** Sends visitors without a session to the sign-in page before any app page renders. */
export function proxy(req: NextRequest) {
  const signedIn = req.cookies.has('masar_session');
  const { pathname } = req.nextUrl;
  if (pathname === '/login') return signedIn ? NextResponse.redirect(new URL('/overview', req.url)) : NextResponse.next();
  if (!signedIn) return NextResponse.redirect(new URL('/login', req.url));
  if (pathname === '/') return NextResponse.redirect(new URL('/overview', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|socket.io|_next|favicon|icon|.*\\..*).*)'],
};
