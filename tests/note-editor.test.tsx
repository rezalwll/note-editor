import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NoteEditor } from "@/components/editor/note-editor";
import { serializeFreeformDocument } from "@/lib/notes";

const mocks = vi.hoisted(() => ({
  openMenu: vi.fn(),
  getLocalPage: vi.fn(),
  upsertLocalPage: vi.fn(),
  enqueuePageUpsert: vi.fn(),
  processSyncQueue: vi.fn(),
}));

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

describe("NoteEditor freeform placement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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
