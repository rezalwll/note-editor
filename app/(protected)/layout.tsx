import { AuthenticatedRuntime } from "@/components/authenticated-runtime";
import { AppShell } from "@/components/app-shell";
import { ClientErrorReporter } from "@/components/client-error-reporter";
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
      <ClientErrorReporter />
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
