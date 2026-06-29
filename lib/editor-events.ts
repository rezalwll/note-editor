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
  | "insert-image"
  | "delete-block"
  | "set-text-color"
  | "set-font-size";

export type ToolbarState = {
  hasActiveBlock: boolean;
  canInsertImage: boolean;
  align: "right" | "center" | "justify";
  bold: boolean;
  italic: boolean;
  textColor: string;
  fontSize: number;
};

export function dispatchEditorCommand(
  command: EditorCommand,
  payload?: { textColor?: string; fontSize?: number },
) {
  window.dispatchEvent(
    new CustomEvent("note-editor-command", {
      detail: { command, ...payload },
    }),
  );
}
