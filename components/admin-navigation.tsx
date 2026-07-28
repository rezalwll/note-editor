import Link from "next/link";
import { BarChart3, Headphones, Users } from "lucide-react";

const links = [
  { href: "/admin", label: "نمای کلی", icon: BarChart3 },
  { href: "/admin/support", label: "پیام‌های پشتیبانی", icon: Headphones },
  { href: "/admin/users", label: "کاربران", icon: Users },
];

export function AdminNavigation() {
  return (
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
