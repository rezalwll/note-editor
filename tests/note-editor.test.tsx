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
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
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
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue({
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
}

describe("NoteEditor pointer placement", () => {
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

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("mounts and focuses a real block at the mobile pointer-up position", async () => {
    setViewport(390);
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
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 40,
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
        width: "240px",
      });
    });
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
    });
    expect(container.querySelector('button[aria-label="جابجایی بلوک"]')).not.toBeNull();
  });
});
