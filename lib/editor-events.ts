export type EditorCommand =
  | "undo"
  | "redo"
  | "toggle-bold"
  | "toggle-italic"
  | "toggle-bullet-list"
  | "toggle-todo-list"
  | "align-right"
  | "align-center"
  | "align-justify"
  | "set-direction-rtl"
  | "set-direction-ltr"
  | "insert-image"
  | "delete-block"
  | "set-text-color"
  | "set-highlight-color"
  | "set-font-size";

export type ToolbarState = {
  hasActiveBlock: boolean;
  canInsertImage: boolean;
  align: "right" | "center" | "justify";
  direction: "rtl" | "ltr";
  bold: boolean;
  italic: boolean;
  textColor: string;
  highlightColor: string;
  fontSize: number;
};

export function dispatchEditorCommand(
  command: EditorCommand,
  payload?: { textColor?: string; highlightColor?: string; fontSize?: number },
) {
  window.dispatchEvent(
    new CustomEvent("note-editor-command", {
      detail: { command, ...payload },
    }),
  );
}
