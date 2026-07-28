import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) {
    notFound();
  }

  return user;
}
