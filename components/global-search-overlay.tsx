"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getOpenSearchEventName,
} from "@/lib/search-events";
import type { SearchResult, SearchResultsPayload, SearchResultType } from "@/lib/search";
import { getFixedVirtualRange } from "@/lib/virtualization";

const SEARCH_DEBOUNCE_MS = 275;
const SEARCH_RESULT_ROW_HEIGHT = 92;
const SEARCH_VIRTUALIZATION_THRESHOLD = 40;

const SECTION_LABELS: Record<SearchResultType, string> = {
  page: "صفحه‌ها",
  notebook: "زیر مجموعه‌ها",
  group: "مجموعه‌ها",
  attachment: "فایل‌ها",
};

const MATCH_COPY: Record<SearchResult["matchedField"], string> = {
  title: "عنوان صفحه",
  bodyText: "متن صفحه",
  tags: "برچسب‌ها",
  name: "نام",
  fileName: "نام فایل",
};

function createEmptyResults(): SearchResultsPayload["results"] {
  return {
    page: [],
    notebook: [],
    group: [],
    attachment: [],
  };
}

function getVisibleResultCount(results: SearchResultsPayload["results"]) {
  return (
    results.page.length +
    results.notebook.length +
    results.group.length +
    results.attachment.length
  );
}

export function GlobalSearchOverlay() {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultListRef = useRef<HTMLDivElement | null>(null);
  const previousPathnameRef = useRef(pathname);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResultsPayload["results"]>(createEmptyResults);
  const [isLoading, setIsLoading] = useState(false);
  const [resultViewport, setResultViewport] = useState({
    scrollTop: 0,
    height: 560,
  });

  useEffect(() => {
    const handleOpenEvent = () => {
      setOpen(true);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener(getOpenSearchEventName(), handleOpenEvent);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener(getOpenSearchEventName(), handleOpenEvent);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open]);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;

    if (!open) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setOpen(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open, pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!debouncedQuery) {
      return;
    }

    const controller = new AbortController();

    async function runSearch() {
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(debouncedQuery)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("SEARCH_REQUEST_FAILED");
        }

        const payload = (await response.json()) as SearchResultsPayload;
        setResults(payload.results);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Failed to search workspace.", error);
        setResults(createEmptyResults());
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void runSearch();
    return () => controller.abort();
  }, [debouncedQuery, open]);

  if (!open) {
    return null;
  }

  const visibleResults = debouncedQuery ? results : createEmptyResults();
  const visibleCount = getVisibleResultCount(visibleResults);
  const shouldShowLoading = Boolean(debouncedQuery) && isLoading;
  const flattenedResults = (
    Object.keys(SECTION_LABELS) as SearchResultType[]
  ).flatMap((type) =>
    visibleResults[type].map((item, index) => ({
      item,
      type,
      isFirstInSection: index === 0,
    })),
  );
  const shouldVirtualizeResults =
    flattenedResults.length >= SEARCH_VIRTUALIZATION_THRESHOLD;
  const resultVirtualRange = getFixedVirtualRange({
    itemCount: flattenedResults.length,
    itemHeight: SEARCH_RESULT_ROW_HEIGHT,
    scrollTop: shouldVirtualizeResults ? resultViewport.scrollTop : 0,
    viewportHeight: shouldVirtualizeResults
      ? resultViewport.height
      : flattenedResults.length * SEARCH_RESULT_ROW_HEIGHT,
    overscan: shouldVirtualizeResults ? 5 : 0,
  });
  const renderedResults = shouldVirtualizeResults
    ? flattenedResults.slice(
        resultVirtualRange.startIndex,
        resultVirtualRange.endIndex,
      )
    : flattenedResults;

  return (
    <div className="fixed inset-0 z-[220] bg-black/35 backdrop-blur-[2px]">
      <div
        className="absolute inset-0"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div className="relative mx-auto mt-8 w-[min(720px,calc(100vw-24px))] overflow-hidden rounded-[28px] border border-white/60 bg-[#fbfcff] shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-center gap-3 border-b border-[#e6ebf5] px-4 py-3">
          <Search className="h-5 w-5 text-[#4b5d87]" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (resultListRef.current) {
                resultListRef.current.scrollTop = 0;
              }
              setResultViewport((current) => ({ ...current, scrollTop: 0 }));
            }}
            placeholder="در صفحه‌ها، زیر مجموعه‌ها، مجموعه‌ها و فایل‌ها جست‌وجو کنید..."
            className="w-full bg-transparent text-right text-sm text-[#1f2a37] outline-none placeholder:text-[#718198]"
            dir="rtl"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#d9e2f1] bg-white text-[#50607a]"
            aria-label="بستن جست‌وجو"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={resultListRef}
          className="max-h-[70vh] overflow-y-auto p-4"
          dir="rtl"
          data-search-results
          data-virtualized={shouldVirtualizeResults ? "true" : "false"}
          data-rendered-count={renderedResults.length}
          onScroll={(event) => {
            if (!shouldVirtualizeResults) {
              return;
            }

            setResultViewport({
              scrollTop: event.currentTarget.scrollTop,
              height: event.currentTarget.clientHeight || 560,
            });
          }}
        >
          {!query.trim() ? (
            <div className="rounded-2xl border border-dashed border-[#dbe4f0] bg-white px-4 py-8 text-center text-sm text-[#6b7280]">
              با `Ctrl+K` یا دکمه جست‌وجو از هرجای برنامه سریع‌تر به نتیجه برسید.
            </div>
          ) : shouldShowLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-8 text-sm text-[#4b5d87]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              در حال جست‌وجو...
            </div>
          ) : visibleCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dbe4f0] bg-white px-4 py-8 text-center text-sm text-[#6b7280]">
              نتیجه‌ای برای این جست‌وجو پیدا نشد.
            </div>
          ) : (
            <div
              className={shouldVirtualizeResults ? "relative" : "grid gap-2"}
              style={
                shouldVirtualizeResults
                  ? { height: `${resultVirtualRange.totalHeight}px` }
                  : undefined
              }
            >
              <div
                className={
                  shouldVirtualizeResults
                    ? "absolute inset-x-0 top-0"
                    : "contents"
                }
                style={
                  shouldVirtualizeResults
                    ? {
                        transform: `translateY(${resultVirtualRange.offsetTop}px)`,
                      }
                    : undefined
                }
              >
                {renderedResults.map(({ item, type, isFirstInSection }) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="relative"
                    style={
                      shouldVirtualizeResults
                        ? { height: `${SEARCH_RESULT_ROW_HEIGHT}px` }
                        : undefined
                    }
                    data-search-result={item.id}
                  >
                    {isFirstInSection ? (
                      <div className="mb-2 px-1 text-[11px] font-semibold text-[#7b8797]">
                        {SECTION_LABELS[type]}
                      </div>
                    ) : null}
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-2xl border border-[#e4eaf4] bg-white px-4 py-3 text-right shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition hover:border-[#c7d5ec] hover:bg-[#fcfdff]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="truncate text-sm font-medium text-[#1f2a37]">
                          {item.title}
                        </div>
                        <div className="shrink-0 rounded-full bg-[#eef4ff] px-2 py-1 text-[10px] text-[#44618e]">
                          {MATCH_COPY[item.matchedField]}
                        </div>
                      </div>
                      {item.subtitle ? (
                        <div className="mt-1 truncate text-xs text-[#708090]">
                          {item.subtitle}
                        </div>
                      ) : null}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
