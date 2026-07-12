"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignRight,
  ChevronDown,
  Bold,
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
import { dispatchEditorCommand, type ToolbarState } from "@/lib/editor-events";

const defaultState: ToolbarState = {
  hasActiveBlock: false,
  canInsertImage: false,
  align: "right",
  direction: "rtl",
  bold: false,
  italic: false,
  textColor: "#222222",
  fontSize: 15,
};

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
  const fontSizeMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<ToolbarState>;
      setToolbarState({
        hasActiveBlock: Boolean(customEvent.detail?.hasActiveBlock),
        canInsertImage: Boolean(customEvent.detail?.canInsertImage),
        align: customEvent.detail?.align ?? "right",
        direction: customEvent.detail?.direction ?? "rtl",
        bold: Boolean(customEvent.detail?.bold),
        italic: Boolean(customEvent.detail?.italic),
        textColor: customEvent.detail?.textColor ?? "#222222",
        fontSize: customEvent.detail?.fontSize ?? 15,
      });
    };

    window.addEventListener("note-editor-state", listener);
    return () => window.removeEventListener("note-editor-state", listener);
  }, []);

  useEffect(() => {
    if (!isFontSizeMenuOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (!fontSizeMenuRef.current?.contains(event.target as Node)) {
        setIsFontSizeMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    return () => window.removeEventListener("mousedown", handleMouseDown);
  }, [isFontSizeMenuOpen]);

  return (
    <div className="flex items-center gap-2 rounded-[22px] border border-white/55 bg-[linear-gradient(135deg,rgba(159,161,255,0.36)_0%,rgba(181,186,255,0.32)_36%,rgba(174,226,255,0.34)_72%,rgba(217,249,223,0.34)_100%)] px-2.5 py-2 shadow-[0_14px_34px_rgba(116,125,255,0.14)] backdrop-blur">
      <ToolbarButton
        label="واگرد"
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("undo")}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="انجام دوباره"
        disabled={!toolbarState.hasActiveBlock}
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
      <label className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/82 px-2 py-1 text-xs text-[#3f4b7b] shadow-[0_8px_20px_rgba(116,125,255,0.14)]">
        <span>رنگ</span>
        <input
          type="color"
          value={toolbarState.textColor}
          disabled={!toolbarState.hasActiveBlock}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onChange={(event) =>
            dispatchEditorCommand("set-text-color", {
              textColor: event.target.value,
            })
          }
          className="h-6 w-6 cursor-pointer rounded border-none bg-transparent p-0"
        />
      </label>
      <div
        ref={fontSizeMenuRef}
        className="relative flex items-center gap-2 rounded-xl border border-white/60 bg-white/82 px-2 py-1 text-xs text-[#3f4b7b] shadow-[0_8px_20px_rgba(116,125,255,0.14)]"
      >
        <span>سایز</span>
        <button
          type="button"
          aria-label="font-size"
          aria-expanded={isFontSizeMenuOpen}
          aria-haspopup="menu"
          disabled={!toolbarState.hasActiveBlock}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => setIsFontSizeMenuOpen((current) => !current)}
          className="inline-flex items-center gap-1 rounded-md bg-transparent text-xs outline-none"
        >
          <span>{toolbarState.fontSize}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {isFontSizeMenuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-16 rounded-xl border border-white/70 bg-white p-1 shadow-[0_14px_34px_rgba(15,23,42,0.14)]"
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
