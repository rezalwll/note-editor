import { ShieldCheck } from "lucide-react";

import { AdminNavigation } from "@/components/admin-navigation";
import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <main className="min-h-full bg-[linear-gradient(180deg,#f6f7ff_0%,#fff_38%)] px-4 py-5 xl:px-6" dir="rtl">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <header className="flex flex-col justify-between gap-4 rounded-[28px] border border-indigo-100 bg-white p-5 shadow-[0_18px_50px_rgba(79,70,229,0.07)] sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold text-indigo-600">مدیریت نوتاوا</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">مرکز مدیریت سبک</h1>
              <p className="mt-1 text-xs text-slate-500">مدیر فعال: {admin.displayName}</p>
            </div>
          </div>
          <AdminNavigation />
        </header>
        {children}
      </div>
    </main>
  );
}
