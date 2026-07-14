"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignRight,
  ChevronDown,
  Bold,
  Highlighter,
  Italic,
  ImagePlus,
  List,
  ListTodo,
  PilcrowLeft,
  PilcrowRight,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dispatchEditorCommand, type ToolbarState } from "@/lib/editor-events";

const defaultState: ToolbarState = {
  hasActiveBlock: false,
  canInsertImage: false,
  canUndo: false,
  canRedo: false,
  align: "right",
  direction: "rtl",
  bold: false,
  italic: false,
  textColor: "#222222",
  highlightColor: "transparent",
  fontSize: 15,
};

const THEME_COLOR_ROWS = [
  ["#ffffff", "#000000", "#e7e6e6", "#44546a", "#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"],
  ["#f2f2f2", "#7f7f7f", "#d0cece", "#d6dce4", "#d9e2f3", "#fce4d6", "#ededed", "#fff2cc", "#ddebf7", "#e2f0d9"],
  ["#d9d9d9", "#595959", "#aeaaaa", "#adb9ca", "#b4c6e7", "#f8cbad", "#d9d9d9", "#ffe699", "#bdd7ee", "#c6e0b4"],
  ["#bfbfbf", "#3f3f3f", "#767171", "#8497b0", "#8eaadb", "#f4b183", "#bfbfbf", "#ffd966", "#9dc3e6", "#a9d18e"],
  ["#a6a6a6", "#262626", "#3b3838", "#323f4f", "#2f5597", "#c65911", "#7f7f7f", "#bf9000", "#2e75b6", "#548235"],
  ["#7f7f7f", "#0d0d0d", "#171717", "#222a35", "#203864", "#833c0c", "#525252", "#806000", "#1f4e79", "#375623"],
] as const;

const STANDARD_COLORS = [
  "#c00000",
  "#ff0000",
  "#ffc000",
  "#ffff00",
  "#92d050",
  "#00b050",
  "#00b0f0",
  "#0070c0",
  "#002060",
  "#7030a0",
] as const;

type ColorMenuKind = "text" | "highlight";

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-5 w-5 rounded-sm border border-black/15"
      style={{
        background:
          color === "transparent"
            ? "linear-gradient(135deg, #ffffff 43%, #dc2626 45%, #dc2626 55%, #ffffff 57%)"
            : color,
      }}
    />
  );
}

function ColorPalette({
  kind,
  currentColor,
  onSelect,
}: {
  kind: ColorMenuKind;
  currentColor: string;
  onSelect: (color: string) => void;
}) {
  const defaultColor = kind === "text" ? "#000000" : "transparent";

  return (
    <>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={currentColor === defaultColor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelect(defaultColor)}
        className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-right text-xs text-[#303858] hover:bg-[#f2f4ff]"
      >
        <ColorSwatch color={defaultColor} />
        <span>{kind === "text" ? "خودکار" : "بدون هایلایت"}</span>
      </button>

      <div className="mb-1 px-1 text-[11px] font-semibold text-[#3f455f]">
        رنگ‌های قالب
      </div>
      <div className="grid grid-cols-10 gap-1 px-1 pb-3">
        {THEME_COLOR_ROWS.flat().map((color, index) => (
          <button
            key={`${color}-${index}`}
            type="button"
            role="menuitemradio"
            aria-label={`رنگ ${color}`}
            aria-checked={currentColor.toLowerCase() === color}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(color)}
            className="h-[22px] w-[22px] rounded-sm border border-black/10 transition hover:scale-110 hover:ring-2 hover:ring-[#818cf8]"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <div className="border-t border-[#e3e5ef] pt-2">
        <div className="mb-1 px-1 text-[11px] font-semibold text-[#3f455f]">
          رنگ‌های استاندارد
        </div>
        <div className="grid grid-cols-10 gap-1 px-1 pb-2">
          {STANDARD_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="menuitemradio"
              aria-label={`رنگ ${color}`}
              aria-checked={currentColor.toLowerCase() === color}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(color)}
              className="h-[22px] w-[22px] rounded-sm border border-black/10 transition hover:scale-110 hover:ring-2 hover:ring-[#818cf8]"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <label className="relative mt-1 flex items-center gap-2 rounded-lg border-t border-[#e3e5ef] px-2 pt-2 text-xs text-[#303858] hover:bg-[#f2f4ff]">
        <span className="h-5 w-5 rounded-full bg-[conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#0ea5e9,#6366f1,#a855f7,#ef4444)]" />
        <span>رنگ‌های بیشتر...</span>
        <input
          type="color"
          aria-label="رنگ‌های بیشتر"
          value={currentColor === "transparent" ? "#fff2a8" : currentColor}
          onMouseDown={(event) => event.preventDefault()}
          onChange={(event) => onSelect(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </>
  );
}

function ToolbarButton({
  children,
  active = false,
  disabled = false,
  label,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border text-[#3f4b7b] shadow-[0_8px_20px_rgba(116,125,255,0.14)] transition",
        disabled
          ? "cursor-not-allowed border-white/35 bg-white/45 text-[#8e97bd] shadow-none"
          : active
            ? "border-[#8f97ff] bg-[linear-gradient(135deg,#9FA1FF_0%,#B5BAFF_100%)] text-white"
            : "border-white/60 bg-white/82 hover:bg-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function EditorToolbar() {
  const [toolbarState, setToolbarState] = useState<ToolbarState>(defaultState);
  const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = useState(false);
  const [colorMenuKind, setColorMenuKind] = useState<ColorMenuKind | null>(null);
  const [colorMenuPosition, setColorMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [fontSizeMenuPosition, setFontSizeMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const fontSizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const fontSizeMenuRef = useRef<HTMLDivElement | null>(null);
  const textColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const highlightButtonRef = useRef<HTMLButtonElement | null>(null);
  const colorMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<ToolbarState>;
      const hasActiveBlock = Boolean(customEvent.detail?.hasActiveBlock);
      setToolbarState({
        hasActiveBlock,
        canInsertImage: Boolean(customEvent.detail?.canInsertImage),
        canUndo: Boolean(customEvent.detail?.canUndo),
        canRedo: Boolean(customEvent.detail?.canRedo),
        align: customEvent.detail?.align ?? "right",
        direction: customEvent.detail?.direction ?? "rtl",
        bold: Boolean(customEvent.detail?.bold),
        italic: Boolean(customEvent.detail?.italic),
        textColor: customEvent.detail?.textColor ?? "#222222",
        highlightColor: customEvent.detail?.highlightColor ?? "transparent",
        fontSize: customEvent.detail?.fontSize ?? 15,
      });

      if (!hasActiveBlock) {
        setIsFontSizeMenuOpen(false);
        setColorMenuKind(null);
      }
    };

    window.addEventListener("note-editor-state", listener);
    return () => window.removeEventListener("note-editor-state", listener);
  }, []);

  useEffect(() => {
    if (!isFontSizeMenuOpen) {
      return;
    }

    const updateMenuPosition = () => {
      const rect = fontSizeButtonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setFontSizeMenuPosition({
        top: rect.bottom + 8,
        left: rect.right - 64,
      });
    };

    updateMenuPosition();

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !fontSizeMenuRef.current?.contains(target) &&
        !fontSizeButtonRef.current?.contains(target)
      ) {
        setIsFontSizeMenuOpen(false);
      }
    };

    const handleViewportChange = () => updateMenuPosition();

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isFontSizeMenuOpen]);

  useEffect(() => {
    if (!colorMenuKind) {
      return;
    }

    const activeButtonRef =
      colorMenuKind === "text" ? textColorButtonRef : highlightButtonRef;

    const updateMenuPosition = () => {
      const rect = activeButtonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const menuWidth = 282;
      setColorMenuPosition({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
      });
    };

    updateMenuPosition();

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !colorMenuRef.current?.contains(target) &&
        !textColorButtonRef.current?.contains(target) &&
        !highlightButtonRef.current?.contains(target)
      ) {
        setColorMenuKind(null);
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [colorMenuKind]);

  const toggleColorMenu = (kind: ColorMenuKind) => {
    setIsFontSizeMenuOpen(false);
    setColorMenuPosition(null);
    setColorMenuKind((current) => (current === kind ? null : kind));
  };

  const selectPaletteColor = (color: string) => {
    if (colorMenuKind === "text") {
      dispatchEditorCommand("set-text-color", { textColor: color });
    } else if (colorMenuKind === "highlight") {
      dispatchEditorCommand("set-highlight-color", { highlightColor: color });
    }

    setColorMenuKind(null);
    setColorMenuPosition(null);
  };

  return (
    <div className="flex items-center gap-2 rounded-[22px] border border-white/55 bg-[linear-gradient(135deg,rgba(159,161,255,0.36)_0%,rgba(181,186,255,0.32)_36%,rgba(174,226,255,0.34)_72%,rgba(217,249,223,0.34)_100%)] px-2.5 py-2 shadow-[0_14px_34px_rgba(116,125,255,0.14)] backdrop-blur">
      <ToolbarButton
        label="واگرد"
        disabled={!toolbarState.canUndo}
        onClick={() => dispatchEditorCommand("undo")}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="انجام دوباره"
        disabled={!toolbarState.canRedo}
        onClick={() => dispatchEditorCommand("redo")}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-7 w-px bg-white/55" />

      <ToolbarButton
        label="تراز راست"
        active={toolbarState.align === "right"}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("align-right")}
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="تراز وسط"
        active={toolbarState.align === "center"}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("align-center")}
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="تراز کامل"
        active={toolbarState.align === "justify"}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("align-justify")}
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-7 w-px bg-white/55" />

      <ToolbarButton
        label="جهت متن راست به چپ"
        active={toolbarState.direction === "rtl"}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("set-direction-rtl")}
      >
        <PilcrowLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="جهت متن چپ به راست"
        active={toolbarState.direction === "ltr"}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("set-direction-ltr")}
      >
        <PilcrowRight className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-7 w-px bg-white/55" />

      <ToolbarButton
        label="مورب"
        active={toolbarState.italic}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("toggle-italic")}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="پررنگ"
        active={toolbarState.bold}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("toggle-bold")}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-7 w-px bg-white/55" />

      <ToolbarButton
        label="فهرست نشانه‌دار"
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("toggle-bullet-list")}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="فهرست کارها"
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("toggle-todo-list")}
      >
        <ListTodo className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-7 w-px bg-white/55" />

      <ToolbarButton
        label="افزودن تصویر"
        disabled={!toolbarState.canInsertImage}
        onClick={() => dispatchEditorCommand("insert-image")}
      >
        <ImagePlus className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-7 w-px bg-white/55" />
      <button
        ref={textColorButtonRef}
        type="button"
        aria-label="رنگ متن"
        aria-expanded={colorMenuKind === "text"}
        aria-haspopup="menu"
        disabled={!toolbarState.hasActiveBlock}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleColorMenu("text")}
        className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/82 px-2 py-1 text-xs text-[#3f4b7b] shadow-[0_8px_20px_rgba(116,125,255,0.14)] outline-none disabled:cursor-not-allowed"
      >
        <span>رنگ</span>
        <ColorSwatch color={toolbarState.textColor} />
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        ref={highlightButtonRef}
        type="button"
        aria-label="highlight-color"
        aria-expanded={colorMenuKind === "highlight"}
        aria-haspopup="menu"
        disabled={!toolbarState.hasActiveBlock}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleColorMenu("highlight")}
        className="flex items-center gap-1.5 rounded-xl border border-white/60 bg-white/82 px-2 py-1 text-xs text-[#3f4b7b] shadow-[0_8px_20px_rgba(116,125,255,0.14)] outline-none disabled:cursor-not-allowed"
      >
        <Highlighter className="h-4 w-4" />
        <ColorSwatch color={toolbarState.highlightColor} />
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        ref={fontSizeButtonRef}
        type="button"
        aria-label="font-size"
        aria-expanded={isFontSizeMenuOpen}
        aria-haspopup="menu"
        disabled={!toolbarState.hasActiveBlock}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          setColorMenuKind(null);
          setIsFontSizeMenuOpen((current) => !current);
        }}
        className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/82 px-2 py-1 text-xs text-[#3f4b7b] shadow-[0_8px_20px_rgba(116,125,255,0.14)] outline-none disabled:cursor-not-allowed"
      >
        <span>سایز</span>
        <span className="inline-flex items-center gap-1">
          <span>{toolbarState.fontSize}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>
      {colorMenuKind && colorMenuPosition
        ? createPortal(
            <div
              ref={colorMenuRef}
              role="menu"
              aria-label={
                colorMenuKind === "text" ? "رنگ متن" : "رنگ هایلایت"
              }
              style={{
                position: "fixed",
                top: colorMenuPosition.top,
                left: colorMenuPosition.left,
                zIndex: 2000,
              }}
              className="w-[282px] rounded-xl border border-[#d7dae7] bg-white p-2 text-right shadow-[0_18px_44px_rgba(15,23,42,0.2)]"
            >
              <ColorPalette
                kind={colorMenuKind}
                currentColor={
                  colorMenuKind === "text"
                    ? toolbarState.textColor
                    : toolbarState.highlightColor
                }
                onSelect={selectPaletteColor}
              />
            </div>,
            document.body,
          )
        : null}
      {isFontSizeMenuOpen && fontSizeMenuPosition
        ? createPortal(
            <div
              ref={fontSizeMenuRef}
              role="menu"
              style={{
                position: "fixed",
                top: fontSizeMenuPosition.top,
                left: fontSizeMenuPosition.left,
                zIndex: 2000,
              }}
              className="min-w-16 rounded-xl border border-white/70 bg-white p-1 shadow-[0_14px_34px_rgba(15,23,42,0.14)]"
            >
              {[14, 15, 16, 18, 20, 24, 28, 32].map((size) => (
                <button
                  key={size}
                  type="button"
                  role="menuitemradio"
                  aria-checked={toolbarState.fontSize === size}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    dispatchEditorCommand("set-font-size", {
                      fontSize: size,
                    });
                    setIsFontSizeMenuOpen(false);
                  }}
                  className={[
                    "flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-xs transition",
                    toolbarState.fontSize === size
                      ? "bg-[#eef2ff] text-[#23316a]"
                      : "hover:bg-[#f5f7ff]",
                  ].join(" ")}
                >
                  {size}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
