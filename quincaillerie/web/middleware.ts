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
  const master = req.cookies.get('qc_admin')?.value;
  const session = req.cookies.get('qc_session')?.value;

  // Le middleware ne fait que le filtrage grossier « connecté ou pas ». Le rôle
  // et le statut réels sont revérifiés en base à chaque appel serveur
  // (/api/admin/db, /api/admin/rpc) : c'est là qu'est la vraie barrière.
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
