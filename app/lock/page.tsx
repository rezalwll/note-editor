import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppLockScreen } from "@/components/app-lock-screen";
import { isAppLockUnlocked } from "@/lib/app-lock";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  getSafeAppLockReturnPath,
  maskEmail,
} from "@/lib/pattern-lock";
import { getSectionDocumentTitle } from "@/lib/page-title";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: getSectionDocumentTitle("قفل برنامه"),
};

type LockPageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function LockPage({ searchParams }: LockPageProps) {
  const user = await requireAuthenticatedUser();
  const { returnTo } = await searchParams;
  const safeReturnPath = getSafeAppLockReturnPath(returnTo);

  if (!user.appLockPatternHash || (await isAppLockUnlocked(user))) {
    redirect(safeReturnPath);
  }

  return (
    <AppLockScreen
      maskedEmail={maskEmail(user.email)}
      returnTo={safeReturnPath}
    />
  );
}
