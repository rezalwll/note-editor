"use client";

import { type Editor, Mark, mergeAttributes } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import { looksLikeMarkdown, markdownToHtml } from "@/lib/markdown";

const TextColor = Mark.create({
  name: "textColor",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attributes) =>
          attributes.color ? { style: `color: ${attributes.color}` } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[style*="color"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

const FontSize = Mark.create({
  name: "fontSize",
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) =>
          attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[style*="font-size"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

export type RichTextBlockHandle = {
  focus: () => void;
  getElement: () => HTMLElement | null;
  getSelectedText: () => string;
  replaceSelection: (text: string, html?: string) => void;
  setTextColor: (color: string) => void;
  setHighlightColor: (color: string) => void;
  setFontSize: (fontSize: number) => void;
};

type RichTextBlockEditorProps = {
  html: string;
  direction: "rtl" | "ltr";
  textAlign: "right" | "center" | "justify";
  defaultColor: string;
  defaultFontSize: number;
  bold: boolean;
  italic: boolean;
  isSelected: boolean;
  selectionColor: string;
  initialSelection?: { start: number; end: number };
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (text: string, html: string) => void;
  onSelectionStyleChange: (style: {
    textColor: string;
    highlightColor: string;
    fontSize: number;
  }) => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>, selectedText: string) => void;
};

export const RichTextBlockEditor = forwardRef<
  RichTextBlockHandle,
  RichTextBlockEditorProps
>(function RichTextBlockEditor(
  {
    html,
    direction,
    textAlign,
    defaultColor,
    defaultFontSize,
    bold,
    italic,
    isSelected,
    selectionColor,
    initialSelection,
    onFocus,
    onBlur,
    onUpdate,
    onSelectionStyleChange,
    onContextMenu,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const latestHtmlRef = useRef(html);
  const reportSelectionStyle = (currentEditor: Editor) => {
    const color = currentEditor.getAttributes("textColor").color;
    const highlightColor = currentEditor.getAttributes("highlight").color;
    const fontSize = currentEditor.getAttributes("fontSize").fontSize;
    onSelectionStyleChange({
      textColor: typeof color === "string" ? color : defaultColor,
      highlightColor:
        typeof highlightColor === "string" ? highlightColor : "transparent",
      fontSize:
        typeof fontSize === "string"
          ? Number.parseInt(fontSize, 10) || defaultFontSize
          : defaultFontSize,
    });
  };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextColor,
      FontSize,
      Highlight.configure({ multicolor: true }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class:
          "ProseMirror min-h-7 w-full border-none bg-transparent px-1 py-0 outline-none",
      },
    },
    onFocus: ({ editor: currentEditor }) => {
      onFocus();
      reportSelectionStyle(currentEditor);
    },
    onBlur,
    onSelectionUpdate: ({ editor: currentEditor }) => {
      reportSelectionStyle(currentEditor);
    },
    onCreate: ({ editor: currentEditor }) => {
      if (!initialSelection || initialSelection.start === initialSelection.end) {
        return;
      }

      const maxPosition = currentEditor.state.doc.content.size;
      currentEditor.commands.setTextSelection({
        from: Math.min(initialSelection.start + 1, maxPosition),
        to: Math.min(initialSelection.end + 1, maxPosition),
      });
      currentEditor.commands.focus(undefined, { scrollIntoView: false });
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextHtml = currentEditor.getHTML();
      latestHtmlRef.current = nextHtml;
      onUpdate(currentEditor.getText({ blockSeparator: "\n" }), nextHtml);
      reportSelectionStyle(currentEditor);
    },
  });

  useEffect(() => {
    if (!editor || html === latestHtmlRef.current) {
      return;
    }

    latestHtmlRef.current = html;
    editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, html]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus(undefined, { scrollIntoView: false }),
      getElement: () => rootRef.current,
      getSelectedText: () => {
        if (!editor) {
          return "";
        }

        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, "\n");
      },
      replaceSelection: (text, replacementHtml) => {
        editor
          ?.chain()
          .focus(undefined, { scrollIntoView: false })
          .insertContent(replacementHtml ?? text)
          .run();
      },
      setTextColor: (color) => {
        editor
          ?.chain()
          .focus(undefined, { scrollIntoView: false })
          .setMark("textColor", { color })
          .run();
      },
      setHighlightColor: (color) => {
        const chain = editor?.chain().focus(undefined, { scrollIntoView: false });

        if (color === "transparent") {
          chain?.unsetHighlight().run();
        } else {
          chain?.setHighlight({ color }).run();
        }
      },
      setFontSize: (fontSize) => {
        editor
          ?.chain()
          .focus(undefined, { scrollIntoView: false })
          .setMark("fontSize", { fontSize: `${fontSize}px` })
          .run();
      },
    }),
    [editor],
  );

  return (
    <div
      ref={rootRef}
      data-rich-text-editor="true"
      onPaste={(event) => {
        const pastedText = event.clipboardData.getData("text/plain");
        if (!editor || !looksLikeMarkdown(pastedText)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .insertContent(markdownToHtml(pastedText))
          .run();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const selectedText = editor
          ? editor.state.doc.textBetween(
              editor.state.selection.from,
              editor.state.selection.to,
              "\n",
            )
          : "";
        onContextMenu(event, selectedText);
      }}
      style={{
        textAlign,
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        color: defaultColor,
        fontSize: `${defaultFontSize}px`,
        boxShadow: isSelected ? `0 0 0 2px ${selectionColor}` : "none",
        borderRadius: "6px",
      }}
      dir={direction}
      className="freeform-rich-text min-h-7 w-full"
    >
      <EditorContent editor={editor} />
    </div>
  );
});
