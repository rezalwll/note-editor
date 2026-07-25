import { NextResponse, type NextRequest } from "next/server";

import { getSessionCookieName, verifySession } from "@/lib/auth";

const isDevelopment = process.env.NODE_ENV !== "production";
const safeIdPattern = /^[a-zA-Z0-9._:-]{1,128}$/;
const serverActionIdPattern = /^[a-f0-9]{40,128}$/i;

function safeRequestId(value: string | null) {
  return value && safeIdPattern.test(value) ? value : null;
}

export async function proxy(request: NextRequest) {
  const requestId =
    safeRequestId(request.headers.get("x-request-id")) ?? crypto.randomUUID();
  const correlationId =
    safeRequestId(request.headers.get("x-correlation-id")) ?? requestId;
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-request-id", requestId);
  forwardedHeaders.set("x-correlation-id", correlationId);
  const next = () => {
    const response = NextResponse.next({
      request: { headers: forwardedHeaders },
    });
    response.headers.set("x-request-id", requestId);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  };
  const redirect = (url: URL) => {
    const response = NextResponse.redirect(url);
    response.headers.set("x-request-id", requestId);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  };
  const pathname = request.nextUrl.pathname;
  const serverActionId = request.headers.get("next-action");

  if (serverActionId && !serverActionIdPattern.test(serverActionId)) {
    const response = NextResponse.json(
      { error: "Invalid server action identifier." },
      { status: 400 },
    );
    response.headers.set("x-request-id", requestId);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  }

  if (pathname === "/api/health") {
    return next();
  }
  const isGuestOnlyRoute =
    pathname === "/login" ||
    pathname === "/signup";
  const isPublicAuthRoute =
    isGuestOnlyRoute ||
    pathname === "/signup/verify" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  if (isDevelopment) {
    return next();
  }

  if (isPublicAuthRoute) {
    const session = await verifySession(
      request.cookies.get(getSessionCookieName())?.value,
    );

    if (isGuestOnlyRoute && session?.userId) {
      return redirect(new URL("/", request.url));
    }

    return next();
  }

  const session = await verifySession(
    request.cookies.get(getSessionCookieName())?.value,
  );

  if (!session?.userId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return redirect(loginUrl);
  }

  return next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
