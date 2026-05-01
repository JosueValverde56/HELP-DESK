import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // En el middleware de Next.js usamos Cookies (es lo más seguro para SSR)
  // Pero por ahora, simularemos la lógica simple para tu avance inicial
  const path = request.nextUrl.pathname;
  
  if (path === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/'],
};