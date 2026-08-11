import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession, sessionSecret } from '@/lib/session';

const PUBLIC_ADMIN_ROUTES = ['/admin/login', '/admin/register'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (PUBLIC_ADMIN_ROUTES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const secret = sessionSecret();
  const master = req.cookies.get('qc_admin')?.value;
  const session = req.cookies.get('qc_session')?.value;

  // Le middleware ne fait que le filtrage grossier « connecté ou pas ». Le rôle
  // et le statut réels sont revérifiés en base à chaque appel serveur
  // (/api/admin/db, /api/admin/rpc) : c'est là qu'est la vraie barrière.
  //
  // Les deux cookies portent un jeton signé — plus aucune comparaison à un
  // secret en clair, qui exposait la clé de signature elle-même.
  let authed = false;
  if (secret) {
    for (const brut of [master, session]) {
      if (brut && (await verifySession(brut, secret))) {
        authed = true;
        break;
      }
    }
  }

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
