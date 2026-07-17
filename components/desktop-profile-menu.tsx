"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import { performSafeLogout } from "@/lib/safe-logout";

type DesktopProfileMenuProps = {
  currentUser: {
    id: string;
    username: string;
    displayName: string;
  };
  userAccent: string;
  userInitials: string;
};

export function DesktopProfileMenu({
  currentUser,
  userAccent,
  userInitials,
}: DesktopProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  async function logoutAndClearClientData() {
    await performSafeLogout(currentUser.id);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePanelPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const panelWidth = 176;

      if (!rect) {
        return;
      }

      setPanelPosition({
        top: rect.bottom + 10,
        left: Math.min(
          Math.max(12, rect.right - panelWidth),
          window.innerWidth - panelWidth - 12,
        ),
      });
    };

    updatePanelPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (dialogRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative flex items-center gap-2">
      <SyncStatusIndicator userId={currentUser.id} />

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-2xl border border-[#d6dee8] bg-white px-2 py-1.5 shadow-[0_3px_10px_rgba(15,23,42,0.08)] transition hover:bg-[#f7fbff]"
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ backgroundColor: userAccent }}
        >
          {userInitials}
        </div>
        <div className="max-w-[78px] truncate text-[12px] font-medium text-[#1f2a37]" dir="ltr">
          @{currentUser.username}
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-[#708090]" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[140] bg-black/12" />
              <div
                ref={dialogRef}
                className="fixed z-[150] flex w-[176px] flex-col rounded-[18px] border border-[#d6dee8] bg-white p-1.5 shadow-[0_22px_54px_rgba(15,23,42,0.16)]"
                style={{
                  top: `${panelPosition.top}px`,
                  left: `${panelPosition.left}px`,
                }}
              >
                <div className="border-b border-[#e8ecf3] px-2.5 py-2 text-center">
                  <div className="truncate text-sm font-semibold text-[#1f2a37]">
                    {currentUser.displayName}
                  </div>
                  <div className="truncate text-[11px] text-[#708090]" dir="ltr">
                    @{currentUser.username}
                  </div>
                </div>

                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="mt-1 rounded-xl px-2.5 py-2 text-center text-sm text-[#32406d] transition hover:bg-[#f7fbff]"
                >
                  تنظیمات
                </Link>

                <form action={logoutAndClearClientData}>
                  <button
                    type="submit"
                    className="w-full rounded-xl px-2.5 py-2 text-center text-sm text-[#b42318] transition hover:bg-[#fff3f2]"
                  >
                    خروج از حساب
                  </button>
                </form>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
