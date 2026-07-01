"use client";

import { Search } from "lucide-react";

import { dispatchOpenSearch } from "@/lib/search-events";

type SearchTriggerProps = {
  ariaLabel?: string;
  className?: string;
  label?: string;
};

export function SearchTrigger({
  ariaLabel = "باز کردن جست‌وجو",
  className,
  label = "جست‌وجو",
}: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={() => dispatchOpenSearch()}
      className={className}
      aria-label={ariaLabel}
      title={ariaLabel}
      dir="rtl"
    >
      <span className="text-sm font-medium">{label}</span>
      <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
    </button>
  );
}
