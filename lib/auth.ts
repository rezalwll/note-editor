import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { Prisma } from "@/generated/prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizeUsername } from "@/lib/users";

const SESSION_COOKIE = "notebook_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;
const secret = new TextEncoder().encode(env.SESSION_SECRET);
const isDevelopment = process.env.NODE_ENV !== "production";

type SessionPayload = {
  userId: string;
};

function mapDatabaseError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    throw new Error(`DATABASE_REQUEST_FAILED:${error.code}`);
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  throw error;
}

export async function getUserByUsername(username: string) {
  try {
    return await prisma.user.findUnique({
      where: { username: normalizeUsername(username) },
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function getUserByEmail(email: string) {
  try {
    return await prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function createBootstrapOwnerIfNeeded() {
  const existingUser = await prisma.user.findFirst();

  if (existingUser) {
    if (!existingUser.username || !existingUser.displayName) {
      return prisma.user.update({
        where: { id: existingUser.id },
        data: {
          username: normalizeUsername(existingUser.username || "owner"),
          displayName: existingUser.displayName || "Owner",
        },
      });
    }

    return existingUser;
  }

  try {
    return await prisma.user.create({
      data: {
        username: normalizeUsername("owner"),
        displayName: "Owner",
        passwordHash: await argon2.hash(env.BOOTSTRAP_PASSWORD),
        mustChangePassword: true,
      },
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);

  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.SESSION_COOKIE_SECURE,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function verifySession(token?: string | null) {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session?.userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.userId },
  });
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    if (isDevelopment) {
      const bootstrapUser = await createBootstrapOwnerIfNeeded();

      if (bootstrapUser) {
        return bootstrapUser;
      }
    }

    redirect("/login");
  }

  return user;
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}
