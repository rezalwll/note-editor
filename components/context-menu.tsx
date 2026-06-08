"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ContextMenuItem = {
  id: string;
  label: string;
  onSelect?: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
};

type ContextMenuEntry = ContextMenuItem | { id: string; separator: true };

type ContextMenuState = {
  x: number;
  y: number;
  title?: string;
  items: ContextMenuEntry[];
};

type ContextMenuContextValue = {
  openMenu: (
    event: Pick<MouseEvent, "clientX" | "clientY"> | Pick<React.MouseEvent, "clientX" | "clientY">,
    options: Omit<ContextMenuState, "x" | "y">,
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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeMenu = () => setMenu(null);
  const value = useMemo<ContextMenuContextValue>(
    () => ({
      openMenu(event, options) {
        setMenu({
          x: event.clientX,
          y: event.clientY,
          title: options.title,
          items: options.items,
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
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
      }
    };

    const handleViewportChange = () => {
      setMenu(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [menu]);

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {menu ? (
        <ContextMenuOverlay
          closeMenu={closeMenu}
          menu={menu}
          menuRef={menuRef}
        />
      ) : null}
    </ContextMenuContext.Provider>
  );
}

function ContextMenuOverlay({
  closeMenu,
  menu,
  menuRef,
}: {
  closeMenu: () => void;
  menu: ContextMenuState;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  const maxWidth = 240;
  const estimatedHeight =
    20 +
    (menu.title ? 36 : 0) +
    menu.items.reduce((total, item) => total + (isSeparator(item) ? 9 : 36), 0);
  const left = Math.max(12, Math.min(menu.x, window.innerWidth - maxWidth - 12));
  const top = Math.max(
    12,
    Math.min(menu.y, window.innerHeight - estimatedHeight - 12),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[200]">
      <div
        ref={menuRef}
        className="pointer-events-auto fixed min-w-[220px] rounded-2xl border border-[#d6dee8] bg-white/98 p-1.5 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur"
        style={{ left, top }}
      >
        {menu.title ? (
          <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7b8b9a]">
            {menu.title}
          </div>
        ) : null}

        {menu.items.map((item) =>
          isSeparator(item) ? (
            <div key={item.id} className="my-1 h-px bg-[#e2e8f0]" />
          ) : (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={async () => {
                if (item.disabled) {
                  return;
                }

                closeMenu();
                await item.onSelect?.();
              }}
              className={[
                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition",
                item.disabled
                  ? "cursor-not-allowed text-[#a3afbb]"
                  : item.danger
                    ? "text-[#b42318] hover:bg-[#fff1f1]"
                    : "text-[#24384c] hover:bg-[#f4f8fc]",
              ].join(" ")}
            >
              <span>{item.label}</span>
            </button>
          ),
        )}
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
