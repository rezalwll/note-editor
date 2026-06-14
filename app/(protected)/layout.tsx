import { AuthenticatedRuntime } from "@/components/authenticated-runtime";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <>
      <AuthenticatedRuntime userId={user.id} />
      <AppShell
        currentUser={{
          id: user.id,
          username: user.username,
          displayName: user.displayName,
        }}
      >
        {children}
      </AppShell>
    </>
  );
}
