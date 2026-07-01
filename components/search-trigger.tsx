"use client";

import { Search } from "lucide-react";

import { dispatchOpenSearch } from "@/lib/search-events";

type SearchTriggerProps = {
  ariaLabel?: string;
  className?: string;
  showShortcut?: boolean;
};

export function SearchTrigger({
  ariaLabel = "باز کردن جست‌وجو",
  className,
  showShortcut = false,
}: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={() => dispatchOpenSearch()}
      className={className}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <Search className="h-[18px] w-[18px]" aria-hidden="true" />
      {showShortcut ? (
        <span className="hidden text-[11px] text-[#6b7280] md:inline">Ctrl+K</span>
      ) : null}
    </button>
  );
}
