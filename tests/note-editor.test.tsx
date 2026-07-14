import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NoteEditor } from "@/components/editor/note-editor";
import { EditorToolbar } from "@/components/editor-toolbar";
import {
  parseFreeformDocument,
  serializeFreeformDocument,
} from "@/lib/notes";

const mocks = vi.hoisted(() => ({
  openMenu: vi.fn(),
  getLocalPage: vi.fn(),
  upsertLocalPage: vi.fn(),
  enqueuePageUpsert: vi.fn(),
  processSyncQueue: vi.fn(),
  clipboardReadText: vi.fn(),
  clipboardWriteText: vi.fn(),
}));

let localPageStore: Record<string, unknown> | null = null;

vi.mock("@/components/context-menu", () => ({
  useContextMenu: () => ({ openMenu: mocks.openMenu }),
}));

vi.mock("@/lib/offline-db/client", () => ({
  getLocalPage: mocks.getLocalPage,
  upsertLocalPage: mocks.upsertLocalPage,
  enqueuePageUpsert: mocks.enqueuePageUpsert,
}));

vi.mock("@/lib/sync/client", () => ({
  processSyncQueue: mocks.processSyncQueue,
}));

function setViewport(width: number, height = 900) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
}

function renderEditor(initialHtml: string, withToolbar = false) {
  return render(
    <>
      {withToolbar ? <EditorToolbar /> : null}
      <NoteEditor
        userId="user-1"
        notebookId="notebook-1"
        pageId="page-1"
        initialTitle="یادداشت"
        initialHtml={initialHtml}
        initialUpdatedAt="2026-06-21T10:00:00.000Z"
        attachments={[]}
      />
    </>,
  );
}

function mockEditorRects(
  canvas: HTMLDivElement,
  page: HTMLDivElement,
  width: number,
) {
  const canvasRectSpy = vi
    .spyOn(canvas, "getBoundingClientRect")
    .mockReturnValue({
      x: 0,
      y: 120,
      top: 120,
      left: 0,
      bottom: 920,
      right: width,
      width,
      height: 800,
      toJSON: () => ({}),
    });
  const pageRectSpy = vi.spyOn(page, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 1000,
    right: width,
    width,
    height: 1000,
    toJSON: () => ({}),
  });

  return { canvasRectSpy, pageRectSpy };
}

function syncLayout() {
  fireEvent(window, new Event("resize"));
}

describe("NoteEditor freeform placement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localPageStore = null;
    mocks.getLocalPage.mockImplementation(async () => localPageStore);
    mocks.upsertLocalPage.mockImplementation(async (page) => {
      localPageStore = page as Record<string, unknown>;
    });
    mocks.enqueuePageUpsert.mockResolvedValue(undefined);
    mocks.processSyncQueue.mockResolvedValue(undefined);
    setViewport(1200);
    vi.spyOn(console, "error").mockImplementation(() => {});

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: mocks.clipboardReadText,
        writeText: mocks.clipboardWriteText,
      },
    });
    mocks.clipboardReadText.mockResolvedValue("");
    mocks.clipboardWriteText.mockResolvedValue(undefined);

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  async function waitForHydration() {
    await waitFor(() => {
      expect(mocks.getLocalPage).toHaveBeenCalled();
    });
  }

  it("measures automatic block width with the rendered text styles", async () => {
    const measurementContext = {
      font: "",
      measureText: vi.fn((value: string) => ({ width: value.length * 10 })),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      measurementContext,
    );

    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "auto-width", x: 48, y: 72, width: 240, text: "start" }],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();
    await waitForHydration();

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    textarea.style.fontFamily = "IRANYekan";
    textarea.style.fontSize = "18px";
    textarea.style.fontWeight = "700";
    textarea.style.paddingLeft = "4px";
    textarea.style.paddingRight = "4px";

    fireEvent.change(textarea, { target: { value: "123456789012345678901234567890" } });

    await waitFor(() => {
      expect(measurementContext.font).toContain("700 18px IRANYekan");
      expect(container.querySelector('[data-testid="note-block-auto-width"]')).toHaveStyle({
        width: "340px",
      });
    });
  });

  it.each([
    ["empty legacy HTML", "<p></p>"],
    [
      "an empty freeform document",
      serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
    ],
  ])("does not create a default block for %s", async (_, initialHtml) => {
    const { container } = renderEditor(initialHtml);

    await waitForHydration();

    expect(container.querySelectorAll("[data-editor-block='true']")).toHaveLength(0);
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("ignores saved empty text blocks when loading a page", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "blank", x: 48, y: 72, text: "" }],
      }),
    );

    await waitForHydration();

    expect(container.querySelectorAll("[data-editor-block='true']")).toHaveLength(0);
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("drops a newly created empty block on blur without saving it", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();
    await waitForHydration();
    vi.clearAllMocks();

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 900,
      clientY: 360,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 900,
      clientY: 360,
      pointerId: 1,
    });

    const textarea = await waitFor(() => {
      const textareas = container.querySelectorAll("textarea");
      expect(textareas).toHaveLength(1);
      return textareas[0] as HTMLTextAreaElement;
    });

    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(container.querySelectorAll("[data-editor-block='true']")).toHaveLength(0);
      expect(container.querySelectorAll("textarea")).toHaveLength(0);
    });
    expect(mocks.upsertLocalPage).not.toHaveBeenCalled();
  });

  it.each([
    { clientX: 40, expectedLeft: "16px" },
    { clientX: 320, expectedLeft: "92px" },
  ])(
    "places and focuses a mobile block using real x/y coordinates",
    async ({ clientX, expectedLeft }) => {
      setViewport(390);
      const { container } = renderEditor(
        serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
      );
      const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
      const page = canvas.parentElement as HTMLDivElement;
      mockEditorRects(canvas, page, 390);
      syncLayout();

      fireEvent.pointerDown(canvas, {
        button: 0,
        clientX,
        clientY: 620,
        pointerId: 1,
      });
      fireEvent.pointerUp(canvas, {
        button: 0,
        clientX,
        clientY: 620,
        pointerId: 1,
      });

      await waitFor(() => {
        const textareas = container.querySelectorAll("textarea");
        expect(textareas).toHaveLength(1);
        expect(document.activeElement).toBe(textareas[0]);
        expect(textareas[0].parentElement).toHaveStyle({
          left: expectedLeft,
          top: "500px",
          width: "240px",
        });
      });
    },
  );

  it("keeps mobile drag freeform on both axes while clamping inside canvas width", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "movable", x: 100, y: 320, width: 240, text: "move me" }],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);
    syncLayout();
    const block = container.querySelector(
      '[data-testid="note-block-movable"]',
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(block).toHaveStyle({ left: "100px", top: "320px", width: "240px" });
    });

    fireEvent.pointerDown(block.querySelector("button") as HTMLButtonElement, {
      button: 0,
      clientX: 120,
      clientY: 330,
      pointerId: 10,
    });
    fireEvent.pointerMove(window, {
      clientX: 370,
      clientY: 600,
      pointerId: 10,
    });
    fireEvent.pointerUp(window, { pointerId: 10 });

    await waitFor(() => {
      expect(block).toHaveStyle({ left: "134px", top: "590px", width: "240px" });
    });
  });

  it("clamps desktop-created blocks on mobile while preserving their y position and scroll reach", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "scattered", x: 280, y: 1000, width: 240, text: "original" }],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);
    syncLayout();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    await waitFor(() => {
      expect(textarea.parentElement).toHaveStyle({
        left: "134px",
        top: "1000px",
        width: "240px",
      });
      expect(canvas.style.minHeight).toBe("1308px");
    });
  });

  it("does not add a block for textarea interaction or drags beyond the placement threshold", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "existing", x: 48, y: 72, width: 240, text: "existing" }],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);
    syncLayout();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.pointerDown(textarea, {
      button: 0,
      clientX: 80,
      clientY: 220,
      pointerId: 2,
    });
    fireEvent.pointerUp(textarea, {
      button: 0,
      clientX: 80,
      clientY: 220,
      pointerId: 2,
    });

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 30,
      clientY: 300,
      pointerId: 3,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 80,
      clientY: 360,
      pointerId: 3,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
  });

  it("keeps desktop freeform placement and drag affordances", async () => {
    setViewport(1200);
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "first", x: 48, y: 72, width: 240, text: "متن" }],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 600,
      clientY: 260,
      pointerId: 5,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 600,
      clientY: 260,
      pointerId: 5,
    });

    await waitFor(() => {
      expect(container.querySelectorAll("textarea")).toHaveLength(2);
      expect(document.activeElement).toBe(container.querySelectorAll("textarea")[1]);
      expect(container.querySelectorAll("textarea")[1].parentElement).toHaveStyle({
        left: "372px",
        top: "140px",
        width: "240px",
      });
    });
    expect(container.querySelector('button[aria-label="جابجایی بلوک"]')).not.toBeNull();
  });
  it("applies text color and font size commands to the active block", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "styled", x: 48, y: 72, width: 240, text: "style me" }],
      }),
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.focus(textarea);
    window.dispatchEvent(
      new CustomEvent("note-editor-command", {
        detail: { command: "set-text-color", textColor: "#ff3366" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("note-editor-command", {
        detail: { command: "set-font-size", fontSize: 24 },
      }),
    );

    await waitFor(() => {
      expect(textarea).toHaveStyle({
        color: "rgb(255, 51, 102)",
        fontSize: "24px",
      });
    });
  });

  it("changes text direction without changing its alignment", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "mixed-direction",
            x: 48,
            y: 72,
            width: 240,
            text: "English متن فارسی",
            align: "right",
            direction: "rtl",
          },
        ],
      }),
      true,
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    const ltrButton = container.querySelector(
      'button[aria-label="جهت متن چپ به راست"]',
    ) as HTMLButtonElement;
    const rtlButton = container.querySelector(
      'button[aria-label="جهت متن راست به چپ"]',
    ) as HTMLButtonElement;

    await waitFor(() => {
      expect(ltrButton).toBeEnabled();
    });
    fireEvent.click(ltrButton);

    await waitFor(() => {
      expect(textarea).toHaveAttribute("dir", "ltr");
      expect(textarea).toHaveStyle({ textAlign: "right" });
    });

    fireEvent.click(rtlButton);

    await waitFor(() => {
      expect(textarea).toHaveAttribute("dir", "rtl");
      expect(textarea).toHaveStyle({ textAlign: "right" });
    });
  });

  it("keeps the active block commandable when clicking toolbar buttons", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "toolbar-bold",
            x: 48,
            y: 72,
            width: 240,
            text: "bold me",
          },
        ],
      }),
      true,
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const boldButton = container.querySelector(
      'button[aria-label="پررنگ"]',
    ) as HTMLButtonElement;

    fireEvent.focus(textarea);
    fireEvent.mouseDown(boldButton);
    fireEvent.click(boldButton);

    await waitFor(() => {
      expect(textarea).toHaveStyle({ fontWeight: "700" });
    });
  });

  it("copies the selected text from the editor context menu", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "copy-target",
            x: 48,
            y: 72,
            width: 240,
            text: "hello world",
          },
        ],
      }),
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    textarea.setSelectionRange(0, 5);
    fireEvent.contextMenu(textarea);

    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const copyAction = menu.items.find(
      (item: { id: string }) => item.id === "copy-text",
    );
    await copyAction.onSelect();

    expect(mocks.clipboardWriteText).toHaveBeenCalledWith("hello");
  });

  it("pastes clipboard text over the current editor selection", async () => {
    mocks.clipboardReadText.mockResolvedValue("Codex");
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "paste-text-target",
            x: 48,
            y: 72,
            width: 240,
            text: "hello world",
          },
        ],
      }),
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    textarea.setSelectionRange(6, 11);
    fireEvent.contextMenu(textarea);

    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const pasteAction = menu.items.find(
      (item: { id: string }) => item.id === "paste-text",
    );
    await pasteAction.onSelect();

    await waitFor(() => {
      expect(textarea).toHaveValue("hello Codex");
      expect(textarea.selectionStart).toBe(11);
      expect(textarea.selectionEnd).toBe(11);
    });
  });

  it("applies text color and font size changes from the toolbar controls", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "styled-toolbar", x: 48, y: 72, width: 240, text: "style me" }],
      }),
      true,
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.focus(textarea);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "رنگ متن" })).toBeEnabled();
    });

    const colorButton = screen.getByRole("button", { name: "رنگ متن" });
    const fontSizeButton = container.querySelector(
      'button[aria-label="font-size"]',
    ) as HTMLButtonElement;

    expect(colorButton).toHaveClass("px-2", "py-1");
    expect(colorButton.querySelector("button")).toBeNull();
    expect(fontSizeButton).toHaveClass("px-2", "py-1");
    expect(fontSizeButton.querySelector("button")).toBeNull();

    await user.click(colorButton);
    expect(screen.getByText("رنگ‌های قالب")).toBeVisible();
    expect(screen.getByText("رنگ‌های استاندارد")).toBeVisible();
    fireEvent.change(screen.getByLabelText("رنگ‌های بیشتر"), {
      target: { value: "#ff3366" },
    });
    await user.click(fontSizeButton);
    await user.click(screen.getByRole("menuitemradio", { name: "24" }));

    await waitFor(() => {
      expect(textarea).toHaveStyle({
        color: "rgb(255, 51, 102)",
        fontSize: "24px",
      });
    });
  });

  it("applies text color and font size only to the selected text", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "inline-styled", x: 48, y: 72, width: 240, text: "style me" },
        ],
      }),
      true,
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.focus(textarea);
    textarea.setSelectionRange(0, 5);
    fireEvent.select(textarea);
    await user.click(screen.getByRole("button", { name: "highlight-color" }));
    await user.click(screen.getByRole("menuitemradio", { name: "رنگ #ffff00" }));

    const richTextEditor = await waitFor(() => {
      const element = container.querySelector(
        '[data-rich-text-editor="true"]',
      ) as HTMLElement | null;
      expect(element).not.toBeNull();
      expect(
        element?.querySelector('mark[style*="background-color"]'),
      ).toHaveTextContent("style");
      return element as HTMLElement;
    });

    await user.click(screen.getByRole("button", { name: "رنگ متن" }));
    fireEvent.change(screen.getByLabelText("رنگ‌های بیشتر"), {
      target: { value: "#ff3366" },
    });

    const fontSizeButton = container.querySelector(
      'button[aria-label="font-size"]',
    ) as HTMLButtonElement;
    await user.click(fontSizeButton);
    await user.click(screen.getByRole("menuitemradio", { name: "24" }));

    await waitFor(() => {
      const colorSpan = richTextEditor.querySelector(
        'span[style*="color"]',
      ) as HTMLElement | null;
      const fontSizeSpan = richTextEditor.querySelector(
        'span[style*="font-size"]',
      ) as HTMLElement | null;
      const highlightSpan = richTextEditor.querySelector(
        'mark[style*="background-color"]',
      ) as HTMLElement | null;

      expect(richTextEditor).toHaveTextContent("style me");
      expect(colorSpan).toHaveTextContent("style");
      expect(colorSpan).toHaveStyle({ color: "rgb(255, 51, 102)" });
      expect(fontSizeSpan).toHaveTextContent("style");
      expect(fontSizeSpan).toHaveStyle({ fontSize: "24px" });
      expect(highlightSpan).toHaveTextContent("style");
      expect(highlightSpan).toHaveStyle({ backgroundColor: "rgb(255, 255, 0)" });
    });
  });

  it("deletes the right-clicked block even when it was not selected beforehand", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "first-block",
            x: 48,
            y: 72,
            width: 240,
            text: "first",
          },
          {
            id: "second-block",
            x: 360,
            y: 72,
            width: 240,
            text: "second",
          },
        ],
      }),
    );
    const textareas = container.querySelectorAll("textarea");

    fireEvent.focus(textareas[0]);
    fireEvent.contextMenu(textareas[1]);

    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const deleteAction = menu.items.find(
      (item: { id: string }) => item.id === "delete-block",
    );
    await deleteAction.onSelect();

    await waitFor(() => {
      const remainingTextareas = container.querySelectorAll("textarea");
      expect(remainingTextareas).toHaveLength(1);
      expect(remainingTextareas[0]).toHaveValue("first");
    });
  });

  it("pastes clipboard text into a new block at the canvas context position", async () => {
    mocks.clipboardReadText.mockResolvedValue("new clipboard block");
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "existing-block",
            x: 48,
            y: 72,
            width: 240,
            text: "existing",
          },
        ],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();
    fireEvent.contextMenu(canvas, {
      clientX: 600,
      clientY: 320,
    });

    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const pasteAction = menu.items.find(
      (item: { id: string }) => item.id === "paste-at-position",
    );
    await pasteAction.onSelect();

    await waitFor(() => {
      const textareas = container.querySelectorAll("textarea");
      expect(textareas).toHaveLength(2);
      expect(textareas[1]).toHaveValue("new clipboard block");
      expect(textareas[1].parentElement).toHaveStyle({
        left: "372px",
        top: "200px",
      });
    });
  });

  it("provides copy and paste actions for the page title", async () => {
    mocks.clipboardReadText.mockResolvedValue("عنوان تازه");
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "title-menu",
            x: 48,
            y: 72,
            width: 240,
            text: "body",
          },
        ],
      }),
    );
    const titleInput = container.querySelector(
      'input[aria-label]',
    ) as HTMLInputElement;
    titleInput.setSelectionRange(0, titleInput.value.length);
    fireEvent.contextMenu(titleInput);

    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const copyAction = menu.items.find(
      (item: { id: string }) => item.id === "copy-title",
    );
    const pasteAction = menu.items.find(
      (item: { id: string }) => item.id === "paste-title",
    );

    await copyAction.onSelect();
    expect(mocks.clipboardWriteText).toHaveBeenCalledWith("یادداشت");

    await pasteAction.onSelect();
    await waitFor(() => {
      expect(titleInput).toHaveValue("عنوان تازه");
    });
  });

  it("uploads a pasted clipboard image and persists it as an image block", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        attachment: {
          id: "attachment-1",
          fileName: "clipboard.png",
          mimeType: "image/png",
          sizeBytes: 4,
        },
        url: "/api/attachments/attachment-1",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "paste-target", x: 48, y: 72, width: 240, text: "target" },
        ],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();
    await waitForHydration();
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        attachment: {
          id: "attachment-1",
          fileName: "clipboard.png",
          mimeType: "image/png",
          sizeBytes: 4,
        },
        url: "/api/attachments/attachment-1",
      }),
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const imageFile = new File(["test"], "clipboard.png", {
      type: "image/png",
    });
    fireEvent.focus(textarea);
    fireEvent.paste(textarea, {
      clipboardData: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => imageFile,
          },
        ],
      },
    });

    await waitFor(() => {
      expect(
        container.querySelector('img[alt="clipboard.png"]'),
      ).not.toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pages/page-1/attachments",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );

    await waitFor(() => {
      const savedPage = mocks.upsertLocalPage.mock.calls
        .map(([pageValue]) => pageValue as { bodyHtml?: string })
        .find((pageValue) => pageValue.bodyHtml?.includes("attachment-1"));
      const savedDocument = savedPage?.bodyHtml
        ? parseFreeformDocument(savedPage.bodyHtml)
        : null;

      expect(savedDocument?.blocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "image",
            attachmentId: "attachment-1",
            fileName: "clipboard.png",
          }),
        ]),
      );
    });
  });

  it("opens the image picker from the toolbar and uploads a selected file", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        attachment: {
          id: "attachment-picker",
          fileName: "selected.webp",
          mimeType: "image/webp",
          sizeBytes: 8,
        },
        url: "/api/attachments/attachment-picker",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "picker-target", x: 48, y: 72, width: 240, text: "target" },
        ],
      }),
      true,
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();
    await waitForHydration();

    const picker = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const pickerClick = vi.spyOn(picker, "click");
    const addImageButton = container.querySelector(
      'button[aria-label="افزودن تصویر"]',
    ) as HTMLButtonElement;

    await waitFor(() => {
      expect(addImageButton).toBeEnabled();
    });
    fireEvent.click(addImageButton);
    expect(pickerClick).toHaveBeenCalledTimes(1);

    const selectedFile = new File(["selected"], "selected.webp", {
      type: "image/webp",
    });
    fireEvent.change(picker, {
      target: { files: [selectedFile] },
    });

    await waitFor(() => {
      expect(
        container.querySelector('img[alt="selected.webp"]'),
      ).not.toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pages/page-1/attachments",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
  });

  it("resizes and removes an existing image block", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "image-existing",
            type: "image",
            attachmentId: "attachment-existing",
            fileName: "existing.png",
            aspectRatio: 2,
            x: 48,
            y: 120,
            width: 420,
            text: "",
          },
        ],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();

    const imageBlock = await waitFor(() => {
      const element = container.querySelector(
        '[data-testid="image-block-image-existing"]',
      ) as HTMLDivElement | null;
      expect(element).not.toBeNull();
      return element as HTMLDivElement;
    });
    const resizeButton = container.querySelector(
      'button[aria-label="تغییر اندازه تصویر"]',
    ) as HTMLButtonElement;

    fireEvent.pointerDown(resizeButton, {
      button: 0,
      clientX: 468,
      pointerId: 20,
    });
    fireEvent.pointerMove(window, {
      clientX: 548,
      pointerId: 20,
    });
    fireEvent.pointerUp(window, { pointerId: 20 });

    await waitFor(() => {
      expect(imageBlock).toHaveStyle({ width: "500px" });
    });

    fireEvent.click(
      container.querySelector(
        'button[aria-label="حذف تصویر"]',
      ) as HTMLButtonElement,
    );

    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-testid="image-block-image-existing"]',
        ),
      ).toBeNull();
    });
  });

  it("resizes a text block from the left edge and stores its position and width", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "resizable", x: 240, y: 72, width: 240, text: "resize me" },
        ],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();
    await waitForHydration();
    vi.clearAllMocks();

    const textBlock = await waitFor(() => {
      const element = container.querySelector(
        '[data-testid="note-block-resizable"]',
      ) as HTMLDivElement | null;
      expect(element).not.toBeNull();
      return element as HTMLDivElement;
    });
    const resizeButton = container.querySelector(
      '[data-testid="resize-block-resizable"]',
    ) as HTMLButtonElement;
    expect(resizeButton).toHaveClass("-left-3");
    expect(resizeButton).not.toHaveClass("-right-3");

    fireEvent.pointerDown(resizeButton, {
      button: 0,
      clientX: 240,
      pointerId: 21,
    });
    fireEvent.pointerMove(window, {
      clientX: 120,
      pointerId: 21,
    });
    fireEvent.pointerUp(window, { pointerId: 21 });

    await waitFor(() => {
      expect(textBlock).toHaveStyle({ left: "120px", width: "360px" });
    });

    fireEvent(window, new Event("pagehide"));

    await waitFor(() => {
      const savedPage = mocks.upsertLocalPage.mock.calls
        .map(([pageValue]) => pageValue as { bodyHtml?: string })
        .find((pageValue) => pageValue.bodyHtml?.includes("resizable"));
      const savedDocument = savedPage?.bodyHtml
        ? parseFreeformDocument(savedPage.bodyHtml)
        : null;

      expect(savedDocument?.blocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "resizable",
            x: 120,
            width: 360,
          }),
        ]),
      );
    });
  });

  it("clamps text block resize to the minimum width", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "min-width", x: 240, y: 72, width: 240, text: "clamp me" },
        ],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();

    const textBlock = await waitFor(() => {
      const element = container.querySelector(
        '[data-testid="note-block-min-width"]',
      ) as HTMLDivElement | null;
      expect(element).not.toBeNull();
      return element as HTMLDivElement;
    });
    const resizeButton = container.querySelector(
      '[data-testid="resize-block-min-width"]',
    ) as HTMLButtonElement;

    fireEvent.pointerDown(resizeButton, {
      button: 0,
      clientX: 240,
      pointerId: 22,
    });
    fireEvent.pointerMove(window, {
      clientX: 720,
      pointerId: 22,
    });
    fireEvent.pointerUp(window, { pointerId: 22 });

    await waitFor(() => {
      expect(textBlock).toHaveStyle({ left: "300px", width: "180px" });
    });
  });

  it("flushes a title change to local storage on pagehide before debounce completes", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "pagehide", x: 48, y: 72, width: 240, text: "body" }],
      }),
    );
    await waitForHydration();
    vi.clearAllMocks();

    const titleInput = container.querySelector('input[aria-label]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "عنوان پایدار" } });
    fireEvent(window, new Event("pagehide"));

    await waitFor(() => {
      expect(mocks.upsertLocalPage).toHaveBeenCalledWith(
        expect.objectContaining({ title: "عنوان پایدار" }),
      );
      expect(mocks.enqueuePageUpsert).toHaveBeenCalled();
    });
  });

  it("flushes textarea edits when the page becomes hidden", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "hidden-save", x: 48, y: 72, width: 240, text: "old" }],
      }),
    );
    await waitForHydration();
    vi.clearAllMocks();

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "متن تازه" } });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() => {
      expect(mocks.upsertLocalPage).toHaveBeenCalledWith(
        expect.objectContaining({ bodyText: "متن تازه" }),
      );
    });
  });

  it("persists a dirty draft when the editor unmounts", async () => {
    const view = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "unmount-save", x: 48, y: 72, width: 240, text: "draft" }],
      }),
    );
    await waitForHydration();
    vi.clearAllMocks();

    const titleInput = view.container.querySelector('input[aria-label]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "قبل از بستن" } });
    view.unmount();

    await waitFor(() => {
      expect(mocks.upsertLocalPage).toHaveBeenCalledWith(
        expect.objectContaining({ title: "قبل از بستن" }),
      );
    });
  });

  it("re-hydrates the last local draft after remote sync fails", async () => {
    mocks.processSyncQueue.mockRejectedValue(new Error("sync failed"));

    const firstView = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "persisted", x: 48, y: 72, width: 240, text: "اولیه" }],
      }),
    );
    await waitForHydration();
    vi.clearAllMocks();

    const titleInput = firstView.container.querySelector('input[aria-label]') as HTMLInputElement;
    const textarea = firstView.container.querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.change(titleInput, { target: { value: "نسخه محلی" } });
    fireEvent.change(textarea, { target: { value: "متن ذخیره محلی" } });
    fireEvent(window, new Event("pagehide"));

    await waitFor(() => {
      expect(mocks.upsertLocalPage).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "نسخه محلی",
          bodyText: "متن ذخیره محلی",
        }),
      );
    });

    firstView.unmount();
    vi.clearAllMocks();

    const secondView = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "persisted", x: 48, y: 72, width: 240, text: "اولیه" }],
      }),
    );

    await waitFor(() => {
      expect(
        (secondView.container.querySelector('input[aria-label]') as HTMLInputElement).value,
      ).toBe("نسخه محلی");
      expect(
        (secondView.container.querySelector("textarea") as HTMLTextAreaElement).value,
      ).toBe("متن ذخیره محلی");
    });
  });

  it("keeps retrying local persistence after a failed local save", async () => {
    const failure = new Error("indexeddb write failed");
    mocks.upsertLocalPage.mockRejectedValue(failure);

    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "retry", x: 48, y: 72, width: 240, text: "old" }],
      }),
    );
    await waitForHydration();
    vi.clearAllMocks();
    mocks.upsertLocalPage.mockRejectedValue(failure);

    const titleInput = container.querySelector('input[aria-label]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "ذخیره ناموفق" } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      expect(mocks.upsertLocalPage).toHaveBeenCalled();
    });
    const firstAttemptCount = mocks.upsertLocalPage.mock.calls.length;

    fireEvent(window, new Event("pagehide"));

    await waitFor(() => {
      expect(mocks.upsertLocalPage.mock.calls.length).toBeGreaterThan(firstAttemptCount);
      expect(mocks.enqueuePageUpsert).not.toHaveBeenCalled();
    });
  });

  it("restores autosaved title and body after remounting the editor", async () => {
    const firstView = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "autosave", x: 48, y: 72, width: 240, text: "body" }],
      }),
    );
    await waitForHydration();
    vi.clearAllMocks();

    const titleInput = firstView.container.querySelector('input[aria-label]') as HTMLInputElement;
    const textarea = firstView.container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(titleInput, { target: { value: "عنوان تازه" } });
    fireEvent.change(textarea, { target: { value: "متن تازه ذخیره شده" } });

    await waitFor(() => {
      expect(mocks.upsertLocalPage).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "عنوان تازه",
          bodyText: "متن تازه ذخیره شده",
        }),
      );
    });

    firstView.unmount();
    vi.clearAllMocks();

    const secondView = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "autosave", x: 48, y: 72, width: 240, text: "body" }],
      }),
    );

    await waitFor(() => {
      expect(
        (secondView.container.querySelector('input[aria-label]') as HTMLInputElement).value,
      ).toBe("عنوان تازه");
      expect(
        (secondView.container.querySelector("textarea") as HTMLTextAreaElement).value,
      ).toBe("متن تازه ذخیره شده");
    });
  });
});
