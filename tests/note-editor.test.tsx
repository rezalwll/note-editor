import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NoteEditor,
  sortBlocksForMobile,
} from "@/components/editor/note-editor";
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

  it("renders stacked blocks on mobile and inserts a new block near the tap position", async () => {
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
    vi.spyOn(textareas[0], "getBoundingClientRect").mockReturnValue({
      x: 16,
      y: 140,
      top: 140,
      left: 16,
      bottom: 168,
      right: 374,
      width: 358,
      height: 28,
      toJSON: () => ({}),
    });
    vi.spyOn(textareas[1], "getBoundingClientRect").mockReturnValue({
      x: 16,
      y: 320,
      top: 320,
      left: 16,
      bottom: 348,
      right: 374,
      width: 358,
      height: 28,
      toJSON: () => ({}),
    });
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

    fireEvent.click(canvas, {
      button: 0,
      clientX: 40,
      clientY: 180,
    });

    await waitFor(() => {
      expect(container.querySelectorAll("textarea")).toHaveLength(3);
    });
    await waitFor(() => {
      const nextTextareas = Array.from(container.querySelectorAll("textarea"));
      expect(nextTextareas.map((element) => element.value)).toEqual([
        "بالا",
        "",
        "پایین",
      ]);
      expect(document.activeElement).toBe(nextTextareas[1]);
      expect(nextTextareas[1].parentElement).toHaveStyle({
        paddingTop: "12px",
      });
      expect(nextTextareas[2].parentElement).toHaveStyle({
        paddingTop: "112px",
      });
    });

    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 40,
      clientY: 180,
      pointerId: 2,
    });
    expect(container.querySelectorAll("textarea")).toHaveLength(3);

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 40,
      clientY: 240,
      pointerId: 3,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 40,
      clientY: 240,
      pointerId: 3,
    });
    fireEvent.click(canvas, {
      button: 0,
      clientX: 40,
      clientY: 240,
    });

    await waitFor(() => {
      const nextTextareas = Array.from(container.querySelectorAll("textarea"));
      expect(nextTextareas).toHaveLength(3);
      expect(nextTextareas.filter((element) => !element.value)).toHaveLength(1);
      expect(nextTextareas[1].parentElement).toHaveStyle({
        paddingTop: "72px",
      });
      expect(nextTextareas[2].parentElement).toHaveStyle({
        paddingTop: "52px",
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(mocks.enqueuePageUpsert).not.toHaveBeenCalled();

    const pendingTextarea = container.querySelectorAll("textarea")[1];
    const intendedTextarea = container.querySelectorAll("textarea")[2];
    expect(document.activeElement).toBe(pendingTextarea);
    fireEvent.pointerDown(intendedTextarea, {
      button: 0,
      clientX: 40,
      clientY: 320,
      pointerId: 4,
    });
    intendedTextarea.focus();
    fireEvent.pointerUp(intendedTextarea, {
      button: 0,
      clientX: 40,
      clientY: 320,
      pointerId: 4,
    });
    fireEvent.click(intendedTextarea, { clientX: 40, clientY: 320 });

    await waitFor(() => {
      const restoredTextareas = Array.from(container.querySelectorAll("textarea"));
      expect(restoredTextareas.map((element) => element.value)).toEqual([
        "بالا",
        "پایین",
      ]);
      expect(restoredTextareas[1].parentElement).toHaveStyle({
        paddingTop: "24px",
      });
      expect(document.activeElement).toBe(intendedTextarea);
    });

    fireEvent.click(canvas, { clientX: 40, clientY: 180 });
    let draft = container.querySelectorAll("textarea")[1];
    fireEvent.change(draft, { target: { value: "temporary" } });
    fireEvent.change(draft, { target: { value: "" } });
    fireEvent.blur(draft);

    await waitFor(() => {
      expect(container.querySelectorAll("textarea")).toHaveLength(2);
      expect(container.querySelectorAll("textarea")[1].parentElement).toHaveStyle({
        paddingTop: "24px",
      });
    });

    fireEvent.click(canvas, { clientX: 40, clientY: 180 });
    draft = container.querySelectorAll("textarea")[1];
    fireEvent.change(draft, { target: { value: "saved mobile block" } });
    fireEvent.blur(draft);

    await waitFor(
      () => {
        expect(mocks.enqueuePageUpsert).toHaveBeenCalledTimes(1);
      },
      { timeout: 1500 },
    );
    const savedPage = mocks.enqueuePageUpsert.mock.calls[0][0];
    const savedDocument = parseFreeformDocument(savedPage.bodyHtml);
    expect(savedDocument?.blocks.map((block) => block.text)).toEqual([
      "پایین",
      "بالا",
      "saved mobile block",
    ]);
  });

  it("moves the initial empty mobile block to the tapped vertical position", async () => {
    setViewportWidth(390);
    const initialHtml = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [
        {
          id: "empty-block",
          x: 48,
          y: 72,
          text: "",
          align: "right",
        },
      ],
    });

    const { container } = renderEditor(initialHtml);

    await waitFor(() => {
      expect(container.querySelector('[data-layout-mode="stacked"]')).not.toBeNull();
    });

    const canvas = container.querySelector(
      '[data-layout-mode="stacked"]',
    ) as HTMLDivElement;
    const canvasRectSpy = vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 120,
      top: 120,
      left: 0,
      bottom: 920,
      right: 390,
      width: 390,
      height: 800,
      toJSON: () => ({}),
    });

    fireEvent.click(canvas, {
      button: 0,
      clientX: 40,
      clientY: 620,
    });

    await waitFor(() => {
      const textareas = Array.from(container.querySelectorAll("textarea"));
      expect(textareas).toHaveLength(1);
      expect(textareas[0].parentElement).toHaveStyle({ paddingTop: "500px" });
      expect(document.activeElement).toBe(textareas[0]);
    });

    fireEvent.blur(container.querySelector("textarea") as HTMLTextAreaElement);

    await waitFor(() => {
      const block = container.querySelector(
        '[data-testid="note-block-empty-block"]',
      ) as HTMLDivElement;
      expect(block.style.paddingTop).toBe("");
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(mocks.enqueuePageUpsert).not.toHaveBeenCalled();

    fireEvent.click(canvas, { clientX: 40, clientY: 620 });
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
      expect(container.querySelector('[data-layout-mode="freeform"]')).not.toBeNull();
      expect(container.querySelectorAll("textarea")).toHaveLength(1);
    });

    canvasRectSpy.mockReturnValue({
      x: 0,
      y: 120,
      top: 120,
      left: 0,
      bottom: 920,
      right: 390,
      width: 390,
      height: 800,
      toJSON: () => ({}),
    });
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(container.querySelector('[data-layout-mode="stacked"]')).not.toBeNull();
      const block = container.querySelector(
        '[data-testid="note-block-empty-block"]',
      ) as HTMLDivElement;
      expect(block.style.paddingTop).toBe("");
    });
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
