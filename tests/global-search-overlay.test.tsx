import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalSearchOverlay } from "@/components/global-search-overlay";
import { SearchTrigger } from "@/components/search-trigger";

const mocks = vi.hoisted(() => ({
  pathname: "/pages/page-1",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("GlobalSearchOverlay", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mocks.pathname = "/pages/page-1";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens from the trigger button and shows the empty state", async () => {
    render(
      <>
        <SearchTrigger className="inline-flex" />
        <GlobalSearchOverlay />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "باز کردن جست‌وجو" }));
    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(
      screen.getByPlaceholderText(
        "در صفحه‌ها، زیر مجموعه‌ها، مجموعه‌ها و فایل‌ها جست‌وجو کنید...",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/با `Ctrl\+K` یا دکمه جست‌وجو/),
    ).toBeInTheDocument();
  });

  it("opens with Ctrl/Cmd + K and debounces the search request", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "alpha",
        results: {
          page: [
            {
              type: "page",
              id: "page-1",
              title: "Alpha page",
              subtitle: "Group / Notebook",
              href: "/pages/page-1",
              matchedField: "title",
            },
          ],
          notebook: [],
          group: [],
          attachment: [],
        },
      }),
    });

    render(<GlobalSearchOverlay />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    act(() => {
      vi.advanceTimersByTime(16);
    });

    const input = screen.getByPlaceholderText(
      "در صفحه‌ها، زیر مجموعه‌ها، مجموعه‌ها و فایل‌ها جست‌وجو کنید...",
    );
    fireEvent.change(input, { target: { value: "alpha" } });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(274);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=alpha", expect.any(Object));
    expect(screen.getByText("صفحه‌ها")).toBeInTheDocument();
    expect(screen.getByText("Alpha page")).toBeInTheDocument();
  });

  it("shows the no-results state and closes after selecting a result", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: "nothing",
          results: {
            page: [],
            notebook: [],
            group: [],
            attachment: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: "file",
          results: {
            page: [],
            notebook: [],
            group: [],
            attachment: [
              {
                type: "attachment",
                id: "attachment-1",
                title: "file.pdf",
                subtitle: "Page / Notebook",
                href: "/pages/page-7",
                matchedField: "fileName",
              },
            ],
          },
        }),
      });

    render(
      <>
        <SearchTrigger className="inline-flex" />
        <GlobalSearchOverlay />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "باز کردن جست‌وجو" }));
    act(() => {
      vi.advanceTimersByTime(16);
    });
    const input = screen.getByPlaceholderText(
      "در صفحه‌ها، زیر مجموعه‌ها، مجموعه‌ها و فایل‌ها جست‌وجو کنید...",
    );

    fireEvent.change(input, { target: { value: "nothing" } });
    await act(async () => {
      vi.advanceTimersByTime(275);
      await Promise.resolve();
    });
    expect(screen.getByText("نتیجه‌ای برای این جست‌وجو پیدا نشد.")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "file" } });
    await act(async () => {
      vi.advanceTimersByTime(275);
      await Promise.resolve();
    });

    const link = screen.getByRole("link", { name: /file\.pdf/i });
    expect(link).toHaveAttribute("href", "/pages/page-7");

    fireEvent.click(link);

    expect(
      screen.queryByPlaceholderText(
        "در صفحه‌ها، زیر مجموعه‌ها، مجموعه‌ها و فایل‌ها جست‌وجو کنید...",
      ),
    ).not.toBeInTheDocument();
  });

  it("loads cursor pages, merges results without duplicates and supports retry", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: "alpha",
          nextCursor: "cursor-1",
          results: {
            page: [
              {
                type: "page",
                id: "page-1",
                title: "Alpha one",
                href: "/pages/page-1",
                matchedField: "title",
              },
            ],
            notebook: [],
            group: [],
            attachment: [],
          },
        }),
      })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: "alpha",
          nextCursor: null,
          results: {
            page: [
              {
                type: "page",
                id: "page-1",
                title: "Alpha one duplicate",
                href: "/pages/page-1",
                matchedField: "title",
              },
              {
                type: "page",
                id: "page-2",
                title: "Alpha two",
                href: "/pages/page-2",
                matchedField: "bodyText",
              },
            ],
            notebook: [],
            group: [],
            attachment: [],
          },
        }),
      });

    render(<GlobalSearchOverlay />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "alpha" },
    });
    await act(async () => {
      vi.advanceTimersByTime(275);
      await Promise.resolve();
    });

    const loadMore = screen.getByRole("button", {
      name: "نمایش نتایج بیشتر",
    });
    await act(async () => {
      fireEvent.click(loadMore);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/search?q=alpha&cursor=cursor-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "بارگذاری نتایج بیشتر ناموفق بود",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "نمایش نتایج بیشتر" }));
      await Promise.resolve();
    });

    expect(screen.getByText("Alpha one")).toBeInTheDocument();
    expect(screen.getByText("Alpha two")).toBeInTheDocument();
    expect(screen.queryByText("Alpha one duplicate")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "نمایش نتایج بیشتر" })).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to load more search results.",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("virtualizes a payload containing four thousand search results", async () => {
    const pages = Array.from({ length: 2_000 }, (_, index) => ({
      type: "page" as const,
      id: `page-${index}`,
      title: `Search page ${index}`,
      subtitle: "Large notebook",
      href: `/pages/page-${index}`,
      matchedField: "title" as const,
    }));
    const attachments = Array.from({ length: 2_000 }, (_, index) => ({
      type: "attachment" as const,
      id: `attachment-${index}`,
      title: `Search file ${index}`,
      subtitle: "Large page",
      href: `/pages/attachment-page-${index}`,
      matchedField: "fileName" as const,
    }));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "search",
        results: {
          page: pages,
          notebook: [],
          group: [],
          attachment: attachments,
        },
      }),
    });

    const { container } = render(<GlobalSearchOverlay />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    fireEvent.change(
      screen.getByRole("textbox"),
      { target: { value: "search" } },
    );

    await act(async () => {
      vi.advanceTimersByTime(275);
      await Promise.resolve();
    });

    const resultList = container.querySelector(
      '[data-search-results][data-virtualized="true"]',
    ) as HTMLDivElement;
    expect(resultList).toBeInTheDocument();
    expect(container.querySelectorAll("[data-search-result]").length).toBeLessThan(25);

    fireEvent.scroll(resultList, { target: { scrollTop: 92_000 } });

    expect(screen.getByText("Search page 1000")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-search-result]").length).toBeLessThan(25);
  });
});
