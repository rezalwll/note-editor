export const SUPPORT_CATEGORIES = [
  "FEEDBACK",
  "BUG",
  "FEATURE",
  "QUESTION",
  "OTHER",
] as const;

export const SUPPORT_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_USER",
  "RESOLVED",
  "CLOSED",
] as const;

export const SUPPORT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  FEEDBACK: "نظر و پیشنهاد",
  BUG: "گزارش مشکل",
  FEATURE: "درخواست قابلیت",
  QUESTION: "پرسش و راهنمایی",
  OTHER: "سایر موارد",
};

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  OPEN: "جدید",
  IN_PROGRESS: "در حال بررسی",
  WAITING_ON_USER: "منتظر پاسخ کاربر",
  RESOLVED: "حل‌شده",
  CLOSED: "بسته‌شده",
};

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  LOW: "کم",
  NORMAL: "عادی",
  HIGH: "زیاد",
  URGENT: "فوری",
};

export function isSupportCategory(value: string): value is SupportCategory {
  return SUPPORT_CATEGORIES.includes(value as SupportCategory);
}

export function isSupportStatus(value: string): value is SupportStatus {
  return SUPPORT_STATUSES.includes(value as SupportStatus);
}

export function isSupportPriority(value: string): value is SupportPriority {
  return SUPPORT_PRIORITIES.includes(value as SupportPriority);
}

export function getSupportCategoryLabel(value: string) {
  return isSupportCategory(value) ? SUPPORT_CATEGORY_LABELS[value] : "سایر";
}

export function getSupportStatusLabel(value: string) {
  return isSupportStatus(value) ? SUPPORT_STATUS_LABELS[value] : value;
}

export function getSupportPriorityLabel(value: string) {
  return isSupportPriority(value) ? SUPPORT_PRIORITY_LABELS[value] : value;
}

export function getSupportStatusClasses(status: string) {
  switch (status) {
    case "OPEN":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "IN_PROGRESS":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "WAITING_ON_USER":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "RESOLVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "CLOSED":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-slate-200 bg-white text-slate-600";
  }
}

export function formatSupportDate(value: Date) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
