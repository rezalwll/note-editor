import { NextResponse, type NextRequest } from "next/server";

import { getSessionCookieName, verifySession } from "@/lib/auth";

const isDevelopment = process.env.NODE_ENV !== "production";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isGuestOnlyRoute =
    pathname === "/login" ||
    pathname === "/signup";
  const isPublicAuthRoute =
    isGuestOnlyRoute ||
    pathname === "/signup/verify" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  if (isDevelopment) {
    return NextResponse.next();
  }

  if (isPublicAuthRoute) {
    const session = await verifySession(
      request.cookies.get(getSessionCookieName())?.value,
    );

    if (isGuestOnlyRoute && session?.userId) {
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
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
