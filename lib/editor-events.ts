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
  | "delete-block";

export type ToolbarState = {
  hasActiveBlock: boolean;
  align: "right" | "center" | "justify";
  bold: boolean;
  italic: boolean;
};

export function dispatchEditorCommand(command: EditorCommand) {
  window.dispatchEvent(
    new CustomEvent("note-editor-command", {
      detail: { command },
    }),
  );
}
