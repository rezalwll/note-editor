import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNoteEditorPersistence } from "@/components/editor/use-note-editor-persistence";
import type { FreeformBlock } from "@/lib/notes";
import { flushPrivateDataDrafts } from "@/lib/private-data-epoch";

const mocks = vi.hoisted(() => ({
  dispatchPageTitleUpdated: vi.fn(),
  enqueuePageUpsert: vi.fn(),
  getLocalPage: vi.fn(),
  processSyncQueue: vi.fn(),
  reportClientError: vi.fn(),
  reportClientMetric: vi.fn(),
  serializeEditorContent: vi.fn(),
  upsertLocalPage: vi.fn(),
}));

vi.mock("@/lib/offline-db/client", () => ({
  enqueuePageUpsert: mocks.enqueuePageUpsert,
  getLocalPage: mocks.getLocalPage,
  upsertLocalPage: mocks.upsertLocalPage,
}));

vi.mock("@/lib/editor-serialization", () => ({
  serializeEditorContent: mocks.serializeEditorContent,
}));

vi.mock("@/lib/page-events", () => ({
  dispatchPageTitleUpdated: mocks.dispatchPageTitleUpdated,
}));

vi.mock("@/lib/sync/client", () => ({
  processSyncQueue: mocks.processSyncQueue,
}));

vi.mock("@/lib/client-observability", () => ({
  reportClientError: mocks.reportClientError,
  reportClientMetric: mocks.reportClientMetric,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const blocks: FreeformBlock[] = [
  { id: "block-1", x: 48, y: 72, width: 240, text: "body" },
];

describe("useNoteEditorPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocalPage.mockResolvedValue(null);
    mocks.upsertLocalPage.mockResolvedValue(undefined);
    mocks.enqueuePageUpsert.mockResolvedValue(undefined);
    mocks.processSyncQueue.mockResolvedValue(undefined);
    mocks.serializeEditorContent.mockResolvedValue({
      bodyHtml: JSON.stringify({ type: "freeform-v1", blocks }),
      bodyText: "body",
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("never lets an older overlapping serialization overwrite the latest draft", async () => {
    const firstSerialization = deferred<{ bodyHtml: string; bodyText: string }>();
    const secondSerialization = deferred<{ bodyHtml: string; bodyText: string }>();
    const stableCallbacks = {
      getBodyText: () => "body",
      getInitialBlocks: () => blocks,
      onDocumentLoaded: vi.fn(),
      resetDocumentHistory: vi.fn(),
      setBlocks: vi.fn(),
      setTitle: vi.fn(),
    };
    const { result, rerender } = renderHook(
      ({ revision, title }: { revision: number; title: string }) =>
        useNoteEditorPersistence({
          userId: "user-1",
          notebookId: "notebook-1",
          pageId: "page-1",
          initialTitle: "initial",
          initialHtml: JSON.stringify({ type: "freeform-v1", blocks }),
          initialUpdatedAt: "2026-07-17T08:00:00.000Z",
          title,
          blocks,
          revision,
          ...stableCallbacks,
        }),
      { initialProps: { revision: 0, title: "initial" } },
    );

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    mocks.serializeEditorContent
      .mockReset()
      .mockImplementationOnce(() => firstSerialization.promise)
      .mockImplementationOnce(() => secondSerialization.promise);

    rerender({ revision: 1, title: "older draft" });
    act(() => result.current.flushPendingSave("first"));
    await waitFor(() => expect(mocks.serializeEditorContent).toHaveBeenCalledTimes(1));

    rerender({ revision: 2, title: "latest draft" });
    act(() => result.current.flushPendingSave("second"));
    await waitFor(() => expect(mocks.serializeEditorContent).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondSerialization.resolve({ bodyHtml: "latest html", bodyText: "latest body" });
      await secondSerialization.promise;
    });
    await waitFor(() =>
      expect(mocks.enqueuePageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "latest draft",
          bodyHtml: "latest html",
          bodyText: "latest body",
        }),
        "2026-07-17T08:00:00.000Z",
      ),
    );

    await act(async () => {
      firstSerialization.resolve({ bodyHtml: "older html", bodyText: "older body" });
      await firstSerialization.promise;
    });

    expect(mocks.enqueuePageUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.enqueuePageUpsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "older draft" }),
      expect.anything(),
    );
    expect(mocks.dispatchPageTitleUpdated).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchPageTitleUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ title: "latest draft" }),
    );
  });

  it("does not block logout during hydration when the user has not edited", async () => {
    const hydration = deferred<null>();
    mocks.getLocalPage.mockReturnValueOnce(hydration.promise);
    const { result } = renderHook(() =>
      useNoteEditorPersistence({
        userId: "user-1",
        notebookId: "notebook-1",
        pageId: "page-1",
        initialTitle: "initial",
        initialHtml: JSON.stringify({ type: "freeform-v1", blocks }),
        initialUpdatedAt: "2026-07-17T08:00:00.000Z",
        title: "initial",
        blocks,
        revision: 0,
        getBodyText: () => "body",
        getInitialBlocks: () => blocks,
        onDocumentLoaded: vi.fn(),
        resetDocumentHistory: vi.fn(),
        setBlocks: vi.fn(),
        setTitle: vi.fn(),
      }),
    );

    expect(result.current.isHydrated).toBe(false);
    await expect(flushPrivateDataDrafts(100)).resolves.toBeUndefined();

    await act(async () => {
      hydration.resolve(null);
      await hydration.promise;
    });
  });

  it("flushes the newest in-memory revision before private data is fenced", async () => {
    const firstSerialization = deferred<{ bodyHtml: string; bodyText: string }>();
    const stableCallbacks = {
      getBodyText: () => "body",
      getInitialBlocks: () => blocks,
      onDocumentLoaded: vi.fn(),
      resetDocumentHistory: vi.fn(),
      setBlocks: vi.fn(),
      setTitle: vi.fn(),
    };
    const { result, rerender } = renderHook(
      ({ revision, title }: { revision: number; title: string }) =>
        useNoteEditorPersistence({
          userId: "user-1",
          notebookId: "notebook-1",
          pageId: "page-1",
          initialTitle: "initial",
          initialHtml: JSON.stringify({ type: "freeform-v1", blocks }),
          initialUpdatedAt: "2026-07-17T08:00:00.000Z",
          title,
          blocks,
          revision,
          ...stableCallbacks,
        }),
      { initialProps: { revision: 0, title: "initial" } },
    );

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    mocks.serializeEditorContent
      .mockReset()
      .mockImplementationOnce(() => firstSerialization.promise)
      .mockResolvedValueOnce({
        bodyHtml: "latest html",
        bodyText: "latest body",
      });

    rerender({ revision: 1, title: "draft one" });
    let flushing!: Promise<void>;
    act(() => {
      flushing = flushPrivateDataDrafts(500);
    });
    await waitFor(() => expect(mocks.serializeEditorContent).toHaveBeenCalledOnce());

    rerender({ revision: 2, title: "draft two" });
    await act(async () => {
      firstSerialization.resolve({
        bodyHtml: "superseded html",
        bodyText: "superseded body",
      });
      await firstSerialization.promise;
    });

    await waitFor(() => expect(mocks.serializeEditorContent).toHaveBeenCalledTimes(2));
    await act(async () => {
      await flushing;
    });

    expect(mocks.enqueuePageUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.enqueuePageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "draft two",
        bodyHtml: "latest html",
        bodyText: "latest body",
      }),
      "2026-07-17T08:00:00.000Z",
    );
  });
});
