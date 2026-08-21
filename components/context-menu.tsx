"use client";

import { Check, ChevronLeft } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ContextMenuItem = {
  id: string;
  label: string;
  onSelect?: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  submenu?: ContextMenuEntry[];
  swatch?: string;
  selected?: boolean;
};

export type ContextMenuEntry =
  | ContextMenuItem
  | { id: string; separator: true };

type ContextMenuState = {
  x: number;
  y: number;
  openedAt: number;
  title?: string;
  items: ContextMenuEntry[];
  dismissOnScroll: boolean;
  lockBodyScroll: boolean;
};

type ContextMenuContextValue = {
  openMenu: (
    event: Pick<MouseEvent, "clientX" | "clientY"> | Pick<React.MouseEvent, "clientX" | "clientY">,
    options: Pick<ContextMenuState, "title" | "items">,
  ) => void;
  closeMenu: () => void;
};

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

function isSeparator(
  item: ContextMenuEntry,
): item is { id: string; separator: true } {
  return "separator" in item;
}

export function ContextMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const closeMenu = () => setMenu(null);
  const value = useMemo<ContextMenuContextValue>(
    () => ({
      openMenu(event, options) {
        const isTouchLike =
          typeof window !== "undefined" &&
          (window.matchMedia("(pointer: coarse)").matches ||
            navigator.maxTouchPoints > 0);

        setMenu({
          x: event.clientX,
          y: event.clientY,
          openedAt: Date.now(),
          title: options.title,
          items: options.items,
          dismissOnScroll: !isTouchLike,
          lockBodyScroll: isTouchLike,
        });
      },
      closeMenu,
    }),
    [],
  );

  useEffect(() => {
    const suppressBrowserContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", suppressBrowserContextMenu);

    return () => {
      window.removeEventListener("contextmenu", suppressBrowserContextMenu);
    };
  }, []);

  useEffect(() => {
    if (!menu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const isInsideMenu =
        target instanceof Element &&
        Boolean(target.closest("[data-context-menu-surface]"));

      if (!isInsideMenu) {
        setMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    if (menu.dismissOnScroll) {
      const handleViewportChange = (event: Event) => {
        // Ignore the late scroll-restoration event that can follow hydration or
        // a redirect immediately after the user's context-menu gesture.
        if (Date.now() - menu.openedAt < 250) {
          return;
        }
        if (
          event.target instanceof Element &&
          event.target.closest("[data-context-menu-surface]")
        ) {
          return;
        }

        setMenu(null);
      };

      window.addEventListener("scroll", handleViewportChange, true);
      window.addEventListener("resize", handleViewportChange);

      return () => {
        window.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("scroll", handleViewportChange, true);
        window.removeEventListener("resize", handleViewportChange);
      };
    }

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu?.lockBodyScroll) {
      return;
    }

    const originalOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [menu]);

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {menu ? (
        <ContextMenuOverlay closeMenu={closeMenu} menu={menu} />
      ) : null}
    </ContextMenuContext.Provider>
  );
}

function ContextMenuOverlay({
  closeMenu,
  menu,
}: {
  closeMenu: () => void;
  menu: ContextMenuState;
}) {
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const [submenuAnchor, setSubmenuAnchor] = useState<DOMRect | null>(null);
  const maxWidth = 240;
  const estimatedHeight =
    20 +
    (menu.title ? 36 : 0) +
    menu.items.reduce((total, item) => total + (isSeparator(item) ? 9 : 36), 0);
  const maxVisibleMenuHeight = Math.min(window.innerHeight * 0.7, 420);
  const visibleMenuHeight = Math.min(estimatedHeight, maxVisibleMenuHeight);
  const left = Math.max(12, Math.min(menu.x, window.innerWidth - maxWidth - 12));
  const top = Math.max(
    12,
    Math.min(menu.y, window.innerHeight - visibleMenuHeight - 12),
  );
  const activeSubmenuItem = menu.items.find(
    (item): item is ContextMenuItem =>
      !isSeparator(item) &&
      item.id === activeSubmenuId &&
      Boolean(item.submenu?.length),
  );
  const submenuWidth = 208;
  const submenuHeight = activeSubmenuItem
    ? 12 +
      activeSubmenuItem.submenu!.reduce(
        (total, item) => total + (isSeparator(item) ? 9 : 40),
        0,
      )
    : 0;
  const visibleSubmenuHeight = Math.min(
    submenuHeight,
    maxVisibleMenuHeight,
  );
  const isNarrowViewport = window.innerWidth < 520;
  const submenuLeft = submenuAnchor
    ? isNarrowViewport
      ? Math.max(12, Math.min(left, window.innerWidth - submenuWidth - 12))
      : submenuAnchor.left - submenuWidth - 8 >= 12
        ? submenuAnchor.left - submenuWidth - 8
        : Math.min(
            window.innerWidth - submenuWidth - 12,
            submenuAnchor.right + 8,
          )
    : left;
  const submenuTop = submenuAnchor
    ? Math.max(
        12,
        Math.min(
          isNarrowViewport ? top : submenuAnchor.top - 6,
          window.innerHeight - visibleSubmenuHeight - 12,
        ),
      )
    : top;

  async function selectItem(item: ContextMenuItem) {
    if (item.disabled) {
      return;
    }

    closeMenu();
    await item.onSelect?.();
  }

  function closeSubmenu() {
    setActiveSubmenuId(null);
    setSubmenuAnchor(null);
  }

  function openSubmenu(item: ContextMenuItem, anchor: DOMRect) {
    setActiveSubmenuId(item.id);
    setSubmenuAnchor(anchor);
  }

  function renderMenuItem(item: ContextMenuItem, isSubmenu = false) {
    const hasSubmenu = Boolean(item.submenu?.length);

    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        data-context-menu-item-id={item.id}
        disabled={item.disabled}
        aria-haspopup={hasSubmenu ? "menu" : undefined}
        aria-expanded={
          hasSubmenu ? activeSubmenuId === item.id : undefined
        }
        onPointerEnter={(event) => {
          if (!isSubmenu) {
            if (hasSubmenu) {
              openSubmenu(item, event.currentTarget.getBoundingClientRect());
            } else {
              closeSubmenu();
            }
          }
        }}
        onKeyDown={(event) => {
          if (
            hasSubmenu &&
            (event.key === "ArrowLeft" || event.key === "ArrowRight")
          ) {
            event.preventDefault();
            openSubmenu(item, event.currentTarget.getBoundingClientRect());
          }
        }}
        onClick={(event) => {
          if (hasSubmenu) {
            openSubmenu(item, event.currentTarget.getBoundingClientRect());
            return;
          }

          void selectItem(item);
        }}
        className={[
          "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition",
          item.disabled
            ? "cursor-not-allowed text-[#a3afbb]"
            : item.danger
              ? "text-[#b42318] hover:bg-[#fff1f1]"
              : activeSubmenuId === item.id
                ? "bg-[var(--bg-softer)] text-[var(--text-strong)]"
                : "text-[var(--text-strong)] hover:bg-[var(--bg-softer)]",
        ].join(" ")}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {item.swatch ? (
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm"
              style={{ backgroundColor: item.swatch }}
              aria-hidden="true"
            />
          ) : null}
          <span className="truncate">{item.label}</span>
        </span>
        {item.selected ? (
          <Check className="h-4 w-4 shrink-0 text-[#268a50]" />
        ) : hasSubmenu ? (
          <ChevronLeft className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        ) : null}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          closeMenu();
        }
      }}
    >
      <div className="contents">
        <div
          data-context-menu-surface
          role="menu"
          className="fixed max-h-[min(70vh,420px)] min-w-[220px] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border-soft)] bg-white/98 p-1.5 shadow-[var(--shadow-soft)] backdrop-blur"
          style={{
            left,
            top,
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onScroll={closeSubmenu}
        >
          {menu.title ? (
            <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {menu.title}
            </div>
          ) : null}

          {menu.items.map((item) =>
            isSeparator(item) ? (
              <div key={item.id} className="my-1 h-px bg-[var(--bg-soft)]" />
            ) : (
              renderMenuItem(item)
            ),
          )}
        </div>

        {activeSubmenuItem && submenuAnchor ? (
          <div
            data-context-menu-surface
            role="menu"
            aria-label={activeSubmenuItem.label}
            className="fixed z-[210] max-h-[min(70vh,420px)] w-[208px] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border-soft)] bg-white/98 p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.2)] backdrop-blur"
            style={{
              left: submenuLeft,
              top: submenuTop,
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 pb-2 pt-1 text-[11px] font-semibold text-[var(--text-muted)]">
              {activeSubmenuItem.label}
            </div>
            {activeSubmenuItem.submenu!.map((item) =>
              isSeparator(item) ? (
                <div key={item.id} className="my-1 h-px bg-[var(--bg-soft)]" />
              ) : (
                renderMenuItem(item, true)
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function useContextMenu() {
  const value = useContext(ContextMenuContext);

  if (!value) {
    throw new Error("useContextMenu must be used within ContextMenuProvider.");
  }

  return value;
}
