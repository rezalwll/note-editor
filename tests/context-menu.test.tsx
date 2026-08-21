import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContextMenuProvider,
  type ContextMenuItem,
  useContextMenu,
} from "@/components/context-menu";

function ContextMenuHarness({
  onSelect,
  submenu,
}: {
  onSelect: () => void;
  submenu?: ContextMenuItem[];
}) {
  const { openMenu } = useContextMenu();

  return (
    <button
      type="button"
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu(event, {
          title: "نمونه",
          items: [
            {
              id: "color",
              label: "رنگ",
              submenu: submenu ?? [
                {
                  id: "mint",
                  label: "نعنایی",
                  swatch: "#AEEBC5",
                  selected: true,
                  onSelect,
                },
                {
                  id: "rose",
                  label: "رز",
                  swatch: "#FFB3C7",
                  onSelect,
                },
              ],
            },
          ],
        });
      }}
    >
      باز کردن منو
    </button>
  );
}

describe("ContextMenu submenus", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 868,
    });
  });

  it("opens a submenu on hover and selects an item", async () => {
    const onSelect = vi.fn();
    render(
      <ContextMenuProvider>
        <ContextMenuHarness onSelect={onSelect} />
      </ContextMenuProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "باز کردن منو" }), {
      clientX: 300,
      clientY: 120,
    });
    const colorItem = screen.getByRole("menuitem", { name: "رنگ" });
    fireEvent.pointerEnter(colorItem);

    expect(
      await screen.findByRole("menu", { name: "رنگ" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "نعنایی" }));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("opens a submenu by clicking its parent item", async () => {
    render(
      <ContextMenuProvider>
        <ContextMenuHarness onSelect={vi.fn()} />
      </ContextMenuProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "باز کردن منو" }), {
      clientX: 300,
      clientY: 120,
    });
    const colorItem = screen.getByRole("menuitem", { name: "رنگ" });
    fireEvent.click(colorItem);

    expect(
      await screen.findByRole("menu", { name: "رنگ" }),
    ).toBeInTheDocument();
  });

  it("keeps a long RTL submenu beside its trigger instead of pinning it to the viewport top", async () => {
    const submenu = Array.from({ length: 22 }, (_, index) => ({
      id: `target-${index}`,
      label: `زیر مجموعه ${index}`,
      onSelect: vi.fn(),
    }));
    render(
      <ContextMenuProvider>
        <ContextMenuHarness onSelect={vi.fn()} submenu={submenu} />
      </ContextMenuProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "باز کردن منو" }), {
      clientX: 1638,
      clientY: 650,
    });
    const colorItem = screen.getByRole("menuitem", { name: "رنگ" });
    vi.spyOn(colorItem, "getBoundingClientRect").mockReturnValue({
      bottom: 776,
      height: 36,
      left: 1638,
      right: 1878,
      top: 740,
      width: 240,
      x: 1638,
      y: 740,
      toJSON: () => ({}),
    });
    fireEvent.pointerEnter(colorItem);

    expect(await screen.findByRole("menu", { name: "رنگ" })).toHaveStyle({
      left: "1422px",
      top: "436px",
    });
  });

  it("opens a submenu on the available side when the preferred RTL side is clipped", async () => {
    render(
      <ContextMenuProvider>
        <ContextMenuHarness onSelect={vi.fn()} />
      </ContextMenuProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "باز کردن منو" }), {
      clientX: 100,
      clientY: 180,
    });
    const colorItem = screen.getByRole("menuitem", { name: "رنگ" });
    vi.spyOn(colorItem, "getBoundingClientRect").mockReturnValue({
      bottom: 236,
      height: 36,
      left: 100,
      right: 340,
      top: 200,
      width: 240,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    });
    fireEvent.pointerEnter(colorItem);

    expect(await screen.findByRole("menu", { name: "رنگ" })).toHaveStyle({
      left: "348px",
      top: "194px",
    });
  });

  it("ignores hydration scroll restoration briefly, then dismisses on scroll", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      <ContextMenuProvider>
        <ContextMenuHarness onSelect={vi.fn()} />
      </ContextMenuProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "باز کردن منو" }), {
      clientX: 300,
      clientY: 120,
    });
    fireEvent.scroll(window);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    now.mockReturnValue(1_251);
    fireEvent.scroll(window);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    now.mockRestore();
  });
});
