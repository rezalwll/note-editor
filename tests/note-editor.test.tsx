import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NoteEditor,
  sortBlocksForMobile,
} from "@/components/editor/note-editor";
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

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
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

describe("NoteEditor mobile reflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocalPage.mockResolvedValue(null);
    mocks.upsertLocalPage.mockResolvedValue(undefined);
    mocks.enqueuePageUpsert.mockResolvedValue(undefined);
    mocks.processSyncQueue.mockResolvedValue(undefined);
    setViewportWidth(1200);

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 900,
    });

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

  it("sorts mobile blocks by visual order", () => {
    const ordered = sortBlocksForMobile([
      { id: "c", x: 120, y: 40, text: "third" },
      { id: "b", x: 280, y: 20, text: "second" },
      { id: "a", x: 40, y: 20, text: "first" },
    ]);

    expect(ordered.map((block) => block.id)).toEqual(["a", "b", "c"]);
  });

  it("renders stacked blocks on mobile and disables blank-canvas creation", async () => {
    setViewportWidth(390);
    const initialHtml = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [
        { id: "block-1", x: 280, y: 320, width: 240, text: "پایین" },
        { id: "block-2", x: 40, y: 40, width: 240, text: "بالا" },
      ],
    });

    const { container } = renderEditor(initialHtml);

    await waitFor(() => {
      expect(container.querySelector('[data-layout-mode="stacked"]')).not.toBeNull();
    });

    const canvas = container.querySelector(
      '[data-layout-mode="stacked"]',
    ) as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 120,
      top: 120,
      left: 0,
      bottom: 720,
      right: 390,
      width: 390,
      height: 600,
      toJSON: () => ({}),
    });
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 900,
      right: 390,
      width: 390,
      height: 900,
      toJSON: () => ({}),
    });

    const textareas = Array.from(container.querySelectorAll("textarea"));
    expect(textareas.map((element) => element.value)).toEqual(["بالا", "پایین"]);
    expect(container.querySelector('[data-layout="stacked"]')?.getAttribute("style")).toBeNull();
    expect(container.querySelector('button[aria-label="جابجایی بلوک"]')).toBeNull();

    fireEvent.contextMenu(canvas, { clientX: 40, clientY: 180 });
    expect(mocks.openMenu).not.toHaveBeenCalled();

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 40,
      clientY: 180,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 40,
      clientY: 180,
      pointerId: 1,
    });

    expect(container.querySelectorAll("textarea")).toHaveLength(2);
  });

  it("keeps desktop freeform creation enabled", async () => {
    setViewportWidth(1200);
    const initialHtml = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [{ id: "block-1", x: 48, y: 72, width: 240, text: "متن اول" }],
    });

    const { container } = renderEditor(initialHtml);

    await waitFor(() => {
      expect(container.querySelector('[data-layout-mode="freeform"]')).not.toBeNull();
    });

    const canvas = container.querySelector(
      '[data-layout-mode="freeform"]',
    ) as HTMLDivElement;
    const page = canvas.parentElement as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 120,
      top: 120,
      left: 0,
      bottom: 720,
      right: 1200,
      width: 1200,
      height: 600,
      toJSON: () => ({}),
    });
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({
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

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 600,
      clientY: 260,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 600,
      clientY: 260,
      pointerId: 1,
    });

    await waitFor(() => {
      expect(container.querySelectorAll("textarea")).toHaveLength(2);
    });
    expect(container.querySelector('button[aria-label="جابجایی بلوک"]')).not.toBeNull();
  });
});
