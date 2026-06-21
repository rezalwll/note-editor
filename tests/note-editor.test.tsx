import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NoteEditor } from "@/components/editor/note-editor";
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
}));
const resizeObserverCallbacks: ResizeObserverCallback[] = [];

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

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function mockVisualViewport(initialHeight: number) {
  let height = initialHeight;
  const resizeListeners = new Set<EventListenerOrEventListenerObject>();
  const viewport = {
    get height() {
      return height;
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "resize") {
        resizeListeners.add(listener);
      }
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "resize") {
        resizeListeners.delete(listener);
      }
    },
  } as unknown as VisualViewport;

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });

  return {
    resize(nextHeight: number) {
      height = nextHeight;
      const event = new Event("resize");
      resizeListeners.forEach((listener) => {
        if (typeof listener === "function") {
          listener(event);
          return;
        }

        listener.handleEvent(event);
      });
    },
  };
}

function renderEditor(initialHtml: string) {
  return render(
    <NoteEditor
      userId="user-1"
      notebookId="notebook-1"
      pageId="page-1"
      initialTitle="یادداشت"
      initialHtml={initialHtml}
      initialUpdatedAt="2026-06-21T10:00:00.000Z"
      attachments={[]}
    />,
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

describe("NoteEditor pointer placement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeObserverCallbacks.length = 0;
    mocks.getLocalPage.mockResolvedValue(null);
    mocks.upsertLocalPage.mockResolvedValue(undefined);
    mocks.enqueuePageUpsert.mockResolvedValue(undefined);
    mocks.processSyncQueue.mockResolvedValue(undefined);
    setViewport(1200);

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

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallbacks.push(callback);
      }

      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it.each([32, 358])(
    "mounts and focuses a full-width mobile block regardless of horizontal tap %i",
    async (clientX) => {
      setViewport(390);
      const { container } = renderEditor(
        serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
      );
      const canvas = container.querySelector(
        ".freeform-canvas",
      ) as HTMLDivElement;
      const page = canvas.parentElement as HTMLDivElement;
      mockEditorRects(canvas, page, 390);

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
        expect(textareas).toHaveLength(2);
        expect(document.activeElement).toBe(textareas[1]);
        expect(textareas[1].parentElement).toHaveStyle({
          left: "16px",
          top: "500px",
          width: "358px",
        });
      });
    },
  );

  it("serializes new mobile pointer blocks without an explicit width", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 320,
      clientY: 620,
      pointerId: 11,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 320,
      clientY: 620,
      pointerId: 11,
    });

    const textarea = container.querySelectorAll("textarea")[1];
    fireEvent.change(textarea, { target: { value: "legacy mobile block" } });

    await waitFor(
      () => {
        expect(mocks.enqueuePageUpsert).toHaveBeenCalledTimes(1);
      },
      { timeout: 1500 },
    );

    const savedPage = mocks.enqueuePageUpsert.mock.calls[0][0];
    const savedDocument = parseFreeformDocument(savedPage.bodyHtml);
    const savedBlock = savedDocument?.blocks.find(
      (block) => block.text === "legacy mobile block",
    );
    expect(savedBlock).toMatchObject({ x: 16, y: 500 });
    expect(savedBlock?.width).toBeUndefined();
  });

  it("restores the active mobile textarea when hydration completes", async () => {
    setViewport(390);
    const localPage = createDeferred<null>();
    mocks.getLocalPage.mockReturnValue(localPage.promise);

    const { container } = renderEditor(
      serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 40,
      clientY: 620,
      pointerId: 12,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 40,
      clientY: 620,
      pointerId: 12,
    });

    const textarea = container.querySelectorAll("textarea")[1];
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    fireEvent.change(textarea, { target: { value: "keep focus" } });

    const outsideButton = document.createElement("button");
    document.body.append(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    localPage.resolve(null);

    await waitFor(() => expect(document.activeElement).toBe(textarea));
    outsideButton.remove();
  });

  it("ignores mobile keyboard viewport height changes", async () => {
    setViewport(390, 900);
    const visualViewport = mockVisualViewport(900);
    const initialHtml = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [{ id: "keyboard", x: 16, y: 40, text: "keyboard" }],
    });
    const { container } = renderEditor(initialHtml);
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    await waitFor(() => expect(canvas).toHaveStyle({ minHeight: "644px" }));
    textarea.focus();
    textarea.setSelectionRange(3, 3);
    const initialCanvasHeight = canvas.style.minHeight;

    visualViewport.resize(400);
    resizeObserverCallbacks.forEach((callback) => {
      callback([], {} as ResizeObserver);
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(canvas.style.minHeight).toBe(initialCanvasHeight);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(3);
  });

  it("ignores mobile drags instead of creating accidental blocks", async () => {
    setViewport(390);
    const { container } = renderEditor(
      serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
    );
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 30,
      clientY: 300,
      pointerId: 2,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 80,
      clientY: 360,
      pointerId: 2,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
  });

  it("keeps focus on the specifically tapped block after repeated placements", async () => {
    setViewport(390);
    const initialHtml = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [
        { id: "upper", x: 16, y: 40, width: 240, text: "بالا" },
        { id: "lower", x: 16, y: 320, width: 240, text: "پایین" },
      ],
    });
    const { container } = renderEditor(initialHtml);
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);

    for (const [pointerId, clientY] of [
      [3, 220],
      [4, 260],
    ] as const) {
      fireEvent.pointerDown(canvas, {
        button: 0,
        clientX: 40,
        clientY,
        pointerId,
      });
      fireEvent.pointerUp(canvas, {
        button: 0,
        clientX: 40,
        clientY,
        pointerId,
      });
    }

    const intended = Array.from(container.querySelectorAll("textarea")).find(
      (element) => element.value === "پایین",
    ) as HTMLTextAreaElement;
    intended.focus();
    fireEvent.click(intended, { clientX: 40, clientY: 330 });
    fireEvent.change(intended, { target: { value: "پایین ویرایش شد" } });

    await waitFor(() => {
      expect(document.activeElement).toBe(intended);
      expect(intended.value).toBe("پایین ویرایش شد");
    });

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(document.activeElement).toBe(intended);
    expect(mocks.enqueuePageUpsert).toHaveBeenCalledTimes(1);
  });

  it("keeps desktop coordinates unchanged while editing in the mobile column", async () => {
    setViewport(390);
    const initialHtml = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [
        { id: "scattered", x: 280, y: 320, width: 240, text: "original" },
      ],
    });
    const { container } = renderEditor(initialHtml);
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    mockEditorRects(canvas, page, 390);

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.parentElement).toHaveStyle({
        left: "16px",
        top: "320px",
        width: "358px",
      });
    });

    textarea.focus();
    fireEvent.change(textarea, { target: { value: "edited on mobile" } });

    await waitFor(
      () => {
        expect(mocks.enqueuePageUpsert).toHaveBeenCalledTimes(1);
      },
      { timeout: 1500 },
    );

    const savedPage = mocks.enqueuePageUpsert.mock.calls[0][0];
    const savedDocument = parseFreeformDocument(savedPage.bodyHtml);
    expect(savedDocument?.blocks[0]).toMatchObject({
      x: 280,
      y: 320,
      width: 240,
      text: "edited on mobile",
    });
    expect(document.activeElement).toBe(textarea);
  });

  it("restores desktop geometry after a vertical-only mobile drag", async () => {
    setViewport(390);
    const initialHtml = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [
        { id: "movable", x: 280, y: 320, width: 240, text: "move me" },
      ],
    });
    const { container } = renderEditor(initialHtml);
    const canvas = container.querySelector(".freeform-canvas") as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    const { canvasRectSpy } = mockEditorRects(canvas, page, 390);
    const block = container.querySelector(
      '[data-testid="note-block-movable"]',
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(block).toHaveStyle({ left: "16px", top: "320px", width: "358px" });
    });

    fireEvent.pointerDown(block.querySelector("button") as HTMLButtonElement, {
      button: 0,
      clientX: 370,
      clientY: 445,
      pointerId: 10,
    });
    fireEvent.pointerMove(window, {
      clientX: 30,
      clientY: 600,
      pointerId: 10,
    });
    fireEvent.pointerUp(window, { pointerId: 10 });

    await waitFor(() => {
      expect(block).toHaveStyle({ left: "16px", top: "475px", width: "358px" });
    });

    setViewport(1200);
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
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(block).toHaveStyle({ left: "280px", top: "475px", width: "240px" });
    });
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
});
