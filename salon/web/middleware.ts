import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/session';

const PUBLIC_ADMIN_ROUTES = ['/admin/login', '/admin/register'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (PUBLIC_ADMIN_ROUTES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const token = process.env.ADMIN_TOKEN;
  const master = req.cookies.get('muse_admin')?.value;
  const session = req.cookies.get('muse_session')?.value;

  // Connecté si : cookie maître valide OU session signée valide.
  // Le rôle/statut précis est vérifié côté serveur (layout + routes API).
  let authed = false;
  if (token && master && master === token) authed = true;
  else if (token && session && (await verifySession(session, token))) authed = true;

  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
