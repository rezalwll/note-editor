"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignRight,
  Bold,
  Italic,
  List,
  ListTodo,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";

type EditorCommand =
  | "undo"
  | "redo"
  | "toggle-bold"
  | "toggle-italic"
  | "toggle-bullet-list"
  | "toggle-todo-list"
  | "align-right"
  | "align-center"
  | "align-justify";

type ToolbarState = {
  hasActiveBlock: boolean;
  align: "right" | "center" | "justify";
  bold: boolean;
  italic: boolean;
};

const defaultState: ToolbarState = {
  hasActiveBlock: false,
  align: "right",
  bold: false,
  italic: false,
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
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border text-[#1299c8] shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition",
        disabled
          ? "cursor-not-allowed border-[#dbe3ec] bg-[#f7f9fc] text-[#9fb7c2] shadow-none"
          : active
            ? "border-[#1098c5] bg-[#1098c5] text-white"
            : "border-[#d6dee8] bg-white hover:bg-[#f7fbff]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function dispatchEditorCommand(command: EditorCommand) {
  window.dispatchEvent(
    new CustomEvent("note-editor-command", {
      detail: { command },
    }),
  );
}

export function EditorToolbar() {
  const [toolbarState, setToolbarState] = useState<ToolbarState>(defaultState);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<ToolbarState>;
      setToolbarState({
        hasActiveBlock: Boolean(customEvent.detail?.hasActiveBlock),
        align: customEvent.detail?.align ?? "right",
        bold: Boolean(customEvent.detail?.bold),
        italic: Boolean(customEvent.detail?.italic),
      });
    };

    window.addEventListener("note-editor-state", listener);
    return () => window.removeEventListener("note-editor-state", listener);
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-[#dde6ef] px-2.5 py-2">
      <ToolbarButton
        label="Undo"
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("undo")}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("redo")}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-7 w-px bg-[#c9d5e1]" />

      <ToolbarButton
        label="Align right"
        active={toolbarState.align === "right"}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("align-right")}
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Align center"
        active={toolbarState.align === "center"}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("align-center")}
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Justify"
        active={toolbarState.align === "justify"}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("align-justify")}
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-7 w-px bg-[#c9d5e1]" />

      <ToolbarButton
        label="Italic"
        active={toolbarState.italic}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("toggle-italic")}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Bold"
        active={toolbarState.bold}
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("toggle-bold")}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-7 w-px bg-[#c9d5e1]" />

      <ToolbarButton
        label="Bullet list"
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("toggle-bullet-list")}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Todo list"
        disabled={!toolbarState.hasActiveBlock}
        onClick={() => dispatchEditorCommand("toggle-todo-list")}
      >
        <ListTodo className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
