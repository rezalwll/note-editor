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
