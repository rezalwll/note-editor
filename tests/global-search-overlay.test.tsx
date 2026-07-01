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
});
