import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContextMenuProvider,
  useContextMenu,
} from "@/components/context-menu";

function ContextMenuHarness({ onSelect }: { onSelect: () => void }) {
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
              submenu: [
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
});
