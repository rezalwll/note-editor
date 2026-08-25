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
    mocks.enqueuePageUpsert.mockImplementation(async (page) => {
      localPageStore = page as Record<string, unknown>;
    });
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

  it("scrolls overflowing editor content inside the white page", () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [],
      }),
    );

    expect(container.firstElementChild).toHaveClass(
      "min-h-0",
      "xl:pt-[6px]",
    );
    expect(screen.getByTestId("note-editor-scroll-area")).toHaveClass(
      "editor-page-scrollbar",
      "md:h-[calc(100dvh-176px)]",
      "md:overflow-y-auto",
      "md:overscroll-contain",
      "xl:h-full",
    );
  });

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

  it("pushes a lower text block down when the active block grows", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "growing", x: 48, y: 72, width: 240, text: "first" },
          { id: "below", x: 48, y: 112, width: 240, text: "second" },
          { id: "beside", x: 400, y: 112, width: 240, text: "beside" },
        ],
      }),
    );
    const growingTextarea = container.querySelector(
      '[data-testid="note-block-growing"] textarea',
    ) as HTMLTextAreaElement;

    fireEvent.change(growingTextarea, {
      target: { value: "first\nsecond line\nthird line" },
    });

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="note-block-below"]'),
      ).toHaveStyle({ top: "168px" });
      expect(
        container.querySelector('[data-testid="note-block-beside"]'),
      ).toHaveStyle({ top: "112px" });
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
    expect(mocks.enqueuePageUpsert).not.toHaveBeenCalled();
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

  it("preserves canonical x during a vertical mobile drag", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "vertical-mobile", x: 600, y: 320, width: 240, text: "move" },
        ],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);
    syncLayout();
    await waitForHydration();
    vi.clearAllMocks();

    const block = container.querySelector(
      '[data-testid="note-block-vertical-mobile"]',
    ) as HTMLDivElement;
    await waitFor(() => {
      expect(block).toHaveStyle({ left: "134px", top: "320px" });
    });

    fireEvent.pointerDown(block.querySelector("button") as HTMLButtonElement, {
      button: 0,
      clientX: 150,
      clientY: 330,
      pointerId: 30,
    });
    fireEvent.pointerMove(window, {
      clientX: 149,
      clientY: 600,
      pointerId: 30,
    });
    fireEvent.pointerUp(window, { pointerId: 30 });
    fireEvent(window, new Event("pagehide"));

    await waitFor(() => {
      const savedPage = mocks.enqueuePageUpsert.mock.calls
        .map(([pageValue]) => pageValue as { bodyHtml?: string })
        .find((pageValue) => pageValue.bodyHtml?.includes("vertical-mobile"));
      const savedDocument = savedPage?.bodyHtml
        ? parseFreeformDocument(savedPage.bodyHtml)
        : null;

      expect(savedDocument?.blocks[0]).toMatchObject({
        id: "vertical-mobile",
        x: 600,
        y: 590,
        width: 240,
      });
      expect(savedDocument?.blocks[0].horizontalAnchor).toBeUndefined();
    });
  });

  it("does not persist a mobile clamp when editing a desktop-positioned block", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "desktop-positioned",
            x: 600,
            y: 72,
            width: 300,
            text: "original",
          },
        ],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);
    syncLayout();
    await waitForHydration();
    vi.clearAllMocks();

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.parentElement).toHaveStyle({ left: "74px" });
    });

    fireEvent.change(textarea, { target: { value: "edited on mobile" } });
    const resizeEdge = container.querySelector(
      '[data-testid="resize-edge-block-desktop-positioned"]',
    ) as HTMLDivElement;
    fireEvent.pointerDown(resizeEdge, {
      button: 0,
      clientX: 74,
      pointerId: 32,
    });
    fireEvent.pointerMove(window, { clientX: 75, pointerId: 32 });
    fireEvent.pointerUp(window, { pointerId: 32 });
    fireEvent(window, new Event("pagehide"));

    await waitFor(() => {
      const savedPage = mocks.enqueuePageUpsert.mock.calls
        .map(([pageValue]) => pageValue as { bodyHtml?: string })
        .find((pageValue) => pageValue.bodyHtml?.includes("edited on mobile"));
      const savedDocument = savedPage?.bodyHtml
        ? parseFreeformDocument(savedPage.bodyHtml)
        : null;

      expect(savedDocument?.blocks[0]).toMatchObject({
        id: "desktop-positioned",
        x: 600,
        y: 72,
        width: 300,
        text: "edited on mobile",
      });
    });
  });

  it("keeps a mobile-created block at the same logical position on desktop", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    const { canvasRectSpy, pageRectSpy } = mockEditorRects(canvas, page, 390);
    syncLayout();

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 320,
      clientY: 620,
      pointerId: 31,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 320,
      clientY: 620,
      pointerId: 31,
    });

    const textarea = await waitFor(() => {
      const element = container.querySelector("textarea") as HTMLTextAreaElement;
      expect(element).not.toBeNull();
      return element;
    });
    const block = textarea.parentElement as HTMLDivElement;
    await waitFor(() => {
      expect(Number.parseFloat(block.style.left)).toBeCloseTo(92, 5);
      expect(Number.parseFloat(block.style.width)).toBe(240);
    });
    const initialMobileLeft = Number.parseFloat(block.style.left);
    const initialMobileWidth = Number.parseFloat(block.style.width);
    const initialMobileAnchor =
      (initialMobileLeft - 16) / (390 - initialMobileWidth - 32);

    fireEvent.change(textarea, { target: { value: "mobile-created block" } });
    await waitFor(() => {
      expect(textarea).toHaveValue("mobile-created block");
      expect(Number.parseFloat(block.style.width)).toBeGreaterThan(0);
    });
    const mobileLeft = Number.parseFloat(block.style.left);
    const mobileWidth = Number.parseFloat(block.style.width);
    const mobileAnchor =
      (mobileLeft - 16) / (390 - mobileWidth - 32);
    expect(mobileAnchor).toBeCloseTo(initialMobileAnchor, 5);

    fireEvent(window, new Event("pagehide"));
    await waitFor(() => {
      const savedPage = mocks.enqueuePageUpsert.mock.calls
        .map(([pageValue]) => pageValue as { bodyHtml?: string })
        .find((pageValue) => pageValue.bodyHtml?.includes("mobile-created block"));
      const savedDocument = savedPage?.bodyHtml
        ? parseFreeformDocument(savedPage.bodyHtml)
        : null;

      expect(savedDocument?.blocks[0].horizontalAnchor).toBeCloseTo(
        initialMobileAnchor,
        5,
      );
    });

    canvasRectSpy.mockReturnValue({
      x: 0,
      y: 120,
      top: 120,
      left: 0,
      bottom: 920,
      right: 1200,
      width: 1200,
      height: 800,
      toJSON: () => ({}),
    });
    pageRectSpy.mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 1000,
      right: 1200,
      width: 1200,
      height: 1000,
      toJSON: () => ({}),
    });
    setViewport(1200);
    syncLayout();

    await waitFor(() => {
      const desktopLeft = Number.parseFloat(block.style.left);
      const desktopWidth = Number.parseFloat(block.style.width);
      const desktopAnchor =
        (desktopLeft - 48) / (1200 - desktopWidth - 96);

      expect(desktopLeft).toBeGreaterThan(48);
      expect(desktopAnchor).toBeCloseTo(initialMobileAnchor, 5);
    });
  });

  it("keeps mobile collision displacement out of the persisted document", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "growing-mobile", x: 48, y: 72, width: 300, text: "short" },
          { id: "below-mobile", x: 48, y: 112, width: 300, text: "below" },
        ],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);
    syncLayout();
    await waitForHydration();
    vi.clearAllMocks();

    const textarea = container.querySelector(
      '[data-testid="note-block-growing-mobile"] textarea',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: Array.from({ length: 20 }, () => "متن طولانی برای چند خط").join(" "),
      },
    });

    await waitFor(() => {
      const belowBlock = container.querySelector(
        '[data-testid="note-block-below-mobile"]',
      ) as HTMLDivElement;
      expect(Number.parseFloat(belowBlock.style.top)).toBeGreaterThan(112);
    });

    fireEvent(window, new Event("pagehide"));
    await waitFor(() => {
      const savedPage = mocks.enqueuePageUpsert.mock.calls
        .map(([pageValue]) => pageValue as { bodyHtml?: string })
        .find((pageValue) => pageValue.bodyHtml?.includes("متن طولانی"));
      const savedDocument = savedPage?.bodyHtml
        ? parseFreeformDocument(savedPage.bodyHtml)
        : null;
      const belowBlock = savedDocument?.blocks.find(
        (blockValue) => blockValue.id === "below-mobile",
      );
      const growingBlock = savedDocument?.blocks.find(
        (blockValue) => blockValue.id === "growing-mobile",
      );

      expect(growingBlock).toMatchObject({ x: 48, y: 72, width: 300 });
      expect(belowBlock).toMatchObject({ x: 48, y: 112, width: 300 });
    });
  });

  it("stacks side-by-side desktop blocks when the mobile canvas makes them collide", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "left", x: 48, y: 72, width: 300, text: "left block" },
          { id: "right", x: 600, y: 72, width: 300, text: "right block" },
        ],
      }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);
    syncLayout();
    const leftBlock = container.querySelector(
      '[data-testid="note-block-left"]',
    ) as HTMLDivElement;
    const rightBlock = container.querySelector(
      '[data-testid="note-block-right"]',
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(rightBlock).toHaveStyle({
        left: "74px",
        top: "72px",
        width: "300px",
      });
      expect(leftBlock).toHaveStyle({
        left: "48px",
        top: "112px",
        width: "300px",
      });
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

  it("keeps the active block commandable and bolds only selected text", async () => {
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
    await waitForHydration();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const boldButton = container.querySelector(
      'button[aria-label="پررنگ"]',
    ) as HTMLButtonElement;

    fireEvent.focus(textarea);
    await waitFor(() => expect(boldButton).toBeEnabled());
    textarea.setSelectionRange(0, 4);
    fireEvent.select(textarea);
    fireEvent.mouseDown(boldButton);
    fireEvent.click(boldButton);

    await waitFor(() => {
      const richTextEditor = container.querySelector(
        '[data-rich-text-editor="true"]',
      ) as HTMLElement | null;
      const strong = richTextEditor?.querySelector("strong");

      expect(richTextEditor).toHaveTextContent("bold me");
      expect(richTextEditor).toHaveStyle({ fontWeight: "400" });
      expect(strong).toHaveTextContent("bold");
      expect(strong).not.toHaveTextContent("bold me");
      expect(boldButton).toHaveAttribute("aria-pressed", "true");
    });

    fireEvent.mouseDown(boldButton);
    fireEvent.click(boldButton);

    await waitFor(() => {
      const richTextEditor = container.querySelector(
        '[data-rich-text-editor="true"]',
      ) as HTMLElement | null;

      expect(richTextEditor?.querySelector("strong")).toBeNull();
      expect(boldButton).toHaveAttribute("aria-pressed", "false");
    });
  });

  it.each([
    ["bullet", "فهرست نشانه‌دار", "● "],
    ["todo", "فهرست کارها", "☐ "],
  ])(
    "continues a %s item when Enter is pressed",
    async (_kind, toolbarLabel, prefix) => {
      const { container } = renderEditor(
        serializeFreeformDocument({
          type: "freeform-v1",
          blocks: [
            {
              id: "continued-list",
              x: 48,
              y: 72,
              width: 240,
              text: "first item",
            },
          ],
        }),
        true,
      );
      const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
      fireEvent.focus(textarea);
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.select(textarea);

      const toolbarButton = screen.getByRole("button", { name: toolbarLabel });
      fireEvent.mouseDown(toolbarButton);
      fireEvent.click(toolbarButton);

      await waitFor(() => {
        expect(textarea).toHaveValue(`${prefix}first item`);
        expect(textarea.selectionStart).toBe(textarea.value.length);
        expect(textarea.selectionEnd).toBe(textarea.value.length);
      });

      fireEvent.keyDown(textarea, { key: "Enter" });

      await waitFor(() => {
        expect(textarea).toHaveValue(
          `${prefix}first item\n${prefix}`,
        );
        expect(textarea.selectionStart).toBe(textarea.value.length);
        expect(textarea.selectionEnd).toBe(textarea.value.length);
      });
    },
  );

  it("starts the next todo unchecked and exits an empty todo item", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "completed-todo",
            x: 48,
            y: 72,
            width: 240,
            text: "☑ completed",
          },
        ],
      }),
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => expect(textarea).toHaveValue("☑ completed\n☐ "));

    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => {
      expect(textarea).toHaveValue("☑ completed\n");
      expect(textarea.selectionStart).toBe(textarea.value.length);
      expect(textarea.selectionEnd).toBe(textarea.value.length);
    });
  });

  it("checks and unchecks a todo marker by clicking it", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "clickable-todos",
            x: 48,
            y: 72,
            width: 320,
            text: "☐ کار اول\n☑ کار دوم",
          },
        ],
      }),
    );
    await waitForHydration();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    textarea.setSelectionRange(0, 0);
    fireEvent.select(textarea);
    fireEvent.click(textarea);
    await waitFor(() => {
      expect(textarea).toHaveValue("☑ کار اول\n☑ کار دوم");
    });

    const secondMarkerPosition = textarea.value.indexOf("☑", 1);
    textarea.setSelectionRange(secondMarkerPosition, secondMarkerPosition);
    fireEvent.select(textarea);
    fireEvent.click(textarea);
    await waitFor(() => {
      expect(textarea).toHaveValue("☑ کار اول\n☐ کار دوم");
    });

    textarea.setSelectionRange(3, 3);
    fireEvent.select(textarea);
    fireEvent.click(textarea);
    expect(textarea).toHaveValue("☑ کار اول\n☐ کار دوم");
  });

  it("uses a pointer cursor only on clickable todo markers", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "todo-pointer",
            x: 48,
            y: 72,
            width: 320,
            text: "متن معمولی\n☐ کار قابل انجام",
          },
        ],
      }),
    );
    await waitForHydration();

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const marker = container.querySelector(
      '[data-todo-marker-position="11"]',
    ) as HTMLElement;

    expect(marker).toHaveClass("cursor-pointer");
    expect(textarea).not.toHaveClass("cursor-pointer");

    fireEvent.pointerDown(marker);
    await waitFor(() => {
      expect(textarea).toHaveValue("متن معمولی\n☑ کار قابل انجام");
    });
  });

  it("includes todo clicks in global undo and redo history", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "todo-history",
            x: 48,
            y: 72,
            width: 240,
            text: "☐ انجام کار",
          },
        ],
      }),
    );
    await waitForHydration();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    textarea.setSelectionRange(0, 0);
    fireEvent.select(textarea);
    fireEvent.click(textarea);
    await waitFor(() => expect(textarea).toHaveValue("☑ انجام کار"));

    fireEvent.keyDown(textarea, { key: "z", ctrlKey: true });
    await waitFor(() => expect(textarea).toHaveValue("☐ انجام کار"));

    fireEvent.keyDown(textarea, { key: "y", ctrlKey: true });
    await waitFor(() => expect(textarea).toHaveValue("☑ انجام کار"));
  });

  it.each([
    ["Latin", "1- first item", "۱- first item\n۲- ", "۱- first item\n"],
    ["Persian", "۹ - first item", "۹ - first item\n۱۰ - ", "۹ - first item\n"],
    [
      "Arabic-Indic",
      "٩- first item",
      "۹- first item\n۱۰- ",
      "۹- first item\n",
    ],
  ])(
    "normalizes, continues, and exits a %s numbered-dash list",
    async (_digitSet, initialText, continuedText, exitedText) => {
      const { container } = renderEditor(
        serializeFreeformDocument({
          type: "freeform-v1",
          blocks: [
            {
              id: "continued-numbered-list",
              x: 48,
              y: 72,
              width: 240,
              text: initialText,
            },
          ],
        }),
      );
      await waitForHydration();
      const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

      fireEvent.focus(textarea);
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.keyDown(textarea, { key: "Enter" });

      await waitFor(() => {
        expect(textarea).toHaveValue(continuedText);
        expect(textarea.selectionStart).toBe(continuedText.length);
      });

      fireEvent.keyDown(textarea, { key: "Enter" });

      await waitFor(() => {
        expect(textarea).toHaveValue(exitedText);
        expect(textarea.selectionStart).toBe(exitedText.length);
      });
    },
  );

  it("renumbers following items when Enter inserts into a numbered list", async () => {
    const initialText = "۱- اول\n۲- دوم\n۳- سوم";
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "renumbered-list",
            x: 48,
            y: 72,
            width: 240,
            text: initialText,
          },
        ],
      }),
    );
    await waitForHydration();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const firstLineEnd = initialText.indexOf("\n");

    fireEvent.focus(textarea);
    textarea.setSelectionRange(firstLineEnd, firstLineEnd);
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(textarea).toHaveValue("۱- اول\n۲- \n۳- دوم\n۴- سوم");
      expect(textarea.selectionStart).toBe("۱- اول\n۲- ".length);
      expect(textarea.selectionEnd).toBe("۱- اول\n۲- ".length);
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

  it("copies all text from the editor context menu", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "copy-all-target",
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
    const copyAllAction = menu.items.find(
      (item: { id: string }) => item.id === "copy-all-text",
    );
    await copyAllAction.onSelect();

    expect(copyAllAction.label).toBe("کپی همه");
    expect(mocks.clipboardWriteText).toHaveBeenCalledWith("hello world");
  });

  it("copies all rich text as plain text from the editor context menu", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          {
            id: "copy-all-rich-target",
            x: 48,
            y: 72,
            width: 240,
            text: "hello world",
            richText: "<p>hello <strong>world</strong></p>",
          },
        ],
      }),
    );
    const richTextEditor = await waitFor(() => {
      const element = container.querySelector(
        '[data-rich-text-editor="true"]',
      ) as HTMLElement | null;
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    fireEvent.contextMenu(richTextEditor);

    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const copyAllAction = menu.items.find(
      (item: { id: string }) => item.id === "copy-all-text",
    );
    await copyAllAction.onSelect();

    expect(menu.title).toBe("بلوک متن");
    expect(copyAllAction.label).toBe("کپی همه");
    expect(mocks.clipboardWriteText).toHaveBeenCalledWith("hello world");
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

  it("pastes from the context menu into a newly created empty block", async () => {
    mocks.clipboardReadText.mockResolvedValue("متن پیست‌شده");
    const { container } = renderEditor(
      serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 1200);
    syncLayout();
    await waitForHydration();

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 900,
      clientY: 360,
      pointerId: 31,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 900,
      clientY: 360,
      pointerId: 31,
    });

    const emptyTextarea = await waitFor(() => {
      const element = container.querySelector("textarea") as HTMLTextAreaElement | null;
      expect(element).not.toBeNull();
      return element as HTMLTextAreaElement;
    });
    fireEvent.contextMenu(emptyTextarea);
    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const pasteAction = menu.items.find(
      (item: { id: string }) => item.id === "paste-text",
    );

    fireEvent.blur(emptyTextarea);
    await waitFor(() => expect(container.querySelector("textarea")).toBeNull());
    await pasteAction.onSelect();

    await waitFor(() => {
      expect(container.querySelector("textarea")).toHaveValue("متن پیست‌شده");
    });
  });

  it("converts pasted Markdown headings and bullet lists to rich text", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "markdown-target", x: 48, y: 72, width: 420, text: "جایگزین" },
        ],
      }),
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const markdown = [
      "# بانک جامع مهارت‌های فنی و رفتاری تیم توسعه وب",
      "",
      "## ۱. ویژگی‌های فردی و مهارت‌های رفتاری",
      "",
      "- انتقادپذیر و پذیرای **بازخورد**",
    ].join("\n");

    textarea.setSelectionRange(0, textarea.value.length);

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [],
        files: [],
        getData: (type: string) => (type === "text/plain" ? markdown : ""),
      },
    });

    await waitFor(() => {
      const richTextEditor = container.querySelector(
        '[data-rich-text-editor="true"]',
      ) as HTMLElement | null;
      expect(richTextEditor).toBeInTheDocument();
      expect(richTextEditor!.querySelector("h1")).toHaveTextContent(
        "بانک جامع مهارت‌های فنی و رفتاری تیم توسعه وب",
      );
      expect(richTextEditor!.querySelector("h2")).toHaveTextContent(
        "۱. ویژگی‌های فردی و مهارت‌های رفتاری",
      );
      expect(richTextEditor!.querySelector("ul li")).toHaveTextContent(
        "انتقادپذیر و پذیرای بازخورد",
      );
      expect(richTextEditor!.querySelector("strong")).toHaveTextContent("بازخورد");
    }, { timeout: 5_000 });
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

  it("undoes and redoes title and block deletion in one global history", async () => {
    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [
          { id: "global-history", x: 48, y: 72, width: 240, text: "keep me" },
        ],
      }),
    );
    await waitForHydration();

    const titleInput = container.querySelector(
      'input[aria-label]',
    ) as HTMLInputElement;
    const originalTitle = titleInput.value;
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.change(titleInput, { target: { value: "Updated title" } });
    fireEvent.blur(titleInput);
    fireEvent.contextMenu(textarea);
    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const deleteAction = menu.items.find(
      (item: { id: string; onSelect?: () => void }) => item.id === "delete-block",
    );
    deleteAction.onSelect();

    await waitFor(() => {
      expect(container.querySelector("textarea")).toBeNull();
      expect(titleInput).toHaveValue("Updated title");
    });

    titleInput.focus();
    fireEvent.keyDown(titleInput, { key: "z", ctrlKey: true });

    await waitFor(() => {
      expect(container.querySelector("textarea")).toHaveValue("keep me");
      expect(titleInput).toHaveValue("Updated title");
    });

    fireEvent.keyDown(titleInput, { key: "z", ctrlKey: true });

    await waitFor(() => {
      expect(titleInput).toHaveValue(originalTitle);
      expect(container.querySelector("textarea")).toHaveValue("keep me");
    });

    fireEvent.keyDown(titleInput, { key: "y", ctrlKey: true });
    await waitFor(() => {
      expect(titleInput).toHaveValue("Updated title");
      expect(container.querySelector("textarea")).toHaveValue("keep me");
    });

    fireEvent.keyDown(titleInput, { key: "y", ctrlKey: true });
    await waitFor(() => {
      expect(container.querySelector("textarea")).toBeNull();
      expect(titleInput).toHaveValue("Updated title");
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
      const savedPage = mocks.enqueuePageUpsert.mock.calls
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

  it("keeps a manually resized text block width while typing", async () => {
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
    const resizeEdge = container.querySelector(
      '[data-testid="resize-edge-block-resizable"]',
    ) as HTMLDivElement;
    expect(container.querySelector('[data-testid^="resize-block-"]')).toBeNull();

    fireEvent.pointerDown(resizeEdge, {
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

    const textarea = textBlock.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "resized and edited" } });

    await waitFor(() => {
      expect(textBlock).toHaveStyle({ left: "120px", width: "360px" });
      expect(textarea).toHaveValue("resized and edited");
    });

    fireEvent(window, new Event("pagehide"));

    await waitFor(() => {
      const savedPage = mocks.enqueuePageUpsert.mock.calls
        .map(([pageValue]) => pageValue as { bodyHtml?: string })
        .find((pageValue) => pageValue.bodyHtml?.includes("resized and edited"));
      const savedDocument = savedPage?.bodyHtml
        ? parseFreeformDocument(savedPage.bodyHtml)
        : null;

      expect(savedDocument?.blocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "resizable",
            x: 120,
            width: 360,
            manualWidth: true,
            text: "resized and edited",
          }),
        ]),
      );
    });
  });

  it("clamps text block resize to the width of its longest word", async () => {
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
    const resizeEdge = container.querySelector(
      '[data-testid="resize-edge-block-min-width"]',
    ) as HTMLDivElement;

    fireEvent.pointerDown(resizeEdge, {
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
      expect(textBlock).toHaveStyle({ left: "417px", width: "63px" });
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
      expect(mocks.enqueuePageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ title: "عنوان پایدار" }),
        expect.any(String),
      );
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
      expect(mocks.enqueuePageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ bodyText: "متن تازه" }),
        expect.any(String),
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
      expect(mocks.enqueuePageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ title: "قبل از بستن" }),
        expect.any(String),
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
      expect(mocks.enqueuePageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "نسخه محلی",
          bodyText: "متن ذخیره محلی",
        }),
        expect.any(String),
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
    mocks.enqueuePageUpsert.mockRejectedValue(failure);

    const { container } = renderEditor(
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: [{ id: "retry", x: 48, y: 72, width: 240, text: "old" }],
      }),
    );
    await waitForHydration();
    vi.clearAllMocks();
    mocks.enqueuePageUpsert.mockRejectedValue(failure);

    const titleInput = container.querySelector('input[aria-label]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "ذخیره ناموفق" } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      expect(mocks.enqueuePageUpsert).toHaveBeenCalled();
    });
    const firstAttemptCount = mocks.enqueuePageUpsert.mock.calls.length;

    fireEvent(window, new Event("pagehide"));

    await waitFor(() => {
      expect(mocks.enqueuePageUpsert.mock.calls.length).toBeGreaterThan(firstAttemptCount);
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
      expect(mocks.enqueuePageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "عنوان تازه",
          bodyText: "متن تازه ذخیره شده",
        }),
        expect.any(String),
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
  it("virtualizes two thousand blocks and keeps the focused block mounted", async () => {
    const blocks = Array.from({ length: 2_000 }, (_, index) => ({
      id: `large-${index}`,
      x: 48,
      y: 72 + index * 120,
      width: 320,
      text: `Large block ${index}`,
    }));
    const { container } = renderEditor(
      serializeFreeformDocument({ type: "freeform-v1", blocks }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    const { canvasRectSpy } = mockEditorRects(canvas, page, 1_200);
    canvasRectSpy.mockReturnValue({
      x: 0,
      y: 120,
      top: 120,
      left: 0,
      bottom: 240_120,
      right: 1_200,
      width: 1_200,
      height: 240_000,
      toJSON: () => ({}),
    });
    syncLayout();
    await waitForHydration();

    expect(canvas).toHaveAttribute("data-virtualized", "true");
    expect(canvas).toHaveAttribute("data-total-block-count", "2000");
    expect(container.querySelectorAll("[data-editor-block]").length).toBeLessThan(40);

    const firstBlock = container.querySelector(
      '[data-testid="note-block-large-0"] textarea',
    ) as HTMLTextAreaElement;
    fireEvent.focus(firstBlock);
    canvasRectSpy.mockReturnValue({
      x: 0,
      y: -119_500,
      top: -119_500,
      left: 0,
      bottom: 120_500,
      right: 1_200,
      width: 1_200,
      height: 240_000,
      toJSON: () => ({}),
    });
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="note-block-large-1000"]'),
      ).toBeInTheDocument();
      expect(
        container.querySelector('[data-testid="note-block-large-0"]'),
      ).toBeInTheDocument();
      expect(container.querySelectorAll("[data-editor-block]").length).toBeLessThan(40);
    });
  });
});
