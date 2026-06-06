import { NextResponse, type NextRequest } from "next/server";

import { getSessionCookieName, verifySession } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/login") {
    const session = await verifySession(
      request.cookies.get(getSessionCookieName())?.value,
    );

    if (session?.userId) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  const session = await verifySession(
    request.cookies.get(getSessionCookieName())?.value,
  );

  if (!session?.userId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
