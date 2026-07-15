"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  enqueuePageUpsert,
  getLocalPage,
  upsertLocalPage,
} from "@/lib/offline-db/client";
import type { LocalPage, SyncStatus } from "@/lib/offline-db/types";
import { serializeEditorContent } from "@/lib/editor-serialization";
import { parseFreeformDocument, type FreeformBlock } from "@/lib/notes";
import { dispatchPageTitleUpdated } from "@/lib/page-events";
import { processSyncQueue } from "@/lib/sync/client";
import {
  reportClientError,
  reportClientMetric,
} from "@/lib/client-observability";

const AUTOSAVE_DEBOUNCE_MS = 150;

type UseNoteEditorPersistenceOptions = {
  userId: string;
  notebookId: string;
  pageId: string;
  initialTitle: string;
  initialHtml: string;
  initialUpdatedAt: string;
  title: string;
  blocks: FreeformBlock[];
  revision: number;
  getBodyText: () => string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setBlocks: React.Dispatch<React.SetStateAction<FreeformBlock[]>>;
  getInitialBlocks: (html: string) => FreeformBlock[];
  resetDocumentHistory: () => void;
  onDocumentLoaded: (blocks: FreeformBlock[]) => void;
};

export function useNoteEditorPersistence({
  userId,
  notebookId,
  pageId,
  initialTitle,
  initialHtml,
  initialUpdatedAt,
  title,
  blocks,
  revision,
  getBodyText,
  setTitle,
  setBlocks,
  getInitialBlocks,
  resetDocumentHistory,
  onDocumentLoaded,
}: UseNoteEditorPersistenceOptions) {
  const [, setSyncStatus] = useState<SyncStatus>("synced");
  const [, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [, setIsSavingLocally] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRevisionRef = useRef(-1);
  const lastSyncedAtRef = useRef(initialUpdatedAt);
  const latestContentRef = useRef({ title, blocks, revision });
  const isMountedRef = useRef(true);
  const userEditedBeforeHydrationRef = useRef(false);
  const autosaveFailureCountRef = useRef(0);

  useLayoutEffect(() => {
    latestContentRef.current = { title, blocks, revision };
  }, [blocks, revision, title]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleConnectionChange = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener("online", handleConnectionChange);
    window.addEventListener("offline", handleConnectionChange);

    return () => {
      window.removeEventListener("online", handleConnectionChange);
      window.removeEventListener("offline", handleConnectionChange);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateFromOfflineStore() {
      const localPage = await getLocalPage(userId, pageId);
      const serverUpdatedAt = new Date(initialUpdatedAt).getTime();
      const localUpdatedAt = localPage ? new Date(localPage.updatedAt).getTime() : 0;
      const userEditedBeforeHydration = userEditedBeforeHydrationRef.current;
      const shouldPreferLocal =
        Boolean(localPage) &&
        ((localPage?.syncStatus ?? "synced") !== "synced" ||
          localUpdatedAt >= serverUpdatedAt);

      const serverPage: LocalPage = {
        id: pageId,
        userId,
        notebookId,
        title: initialTitle,
        bodyHtml: initialHtml,
        bodyText:
          parseFreeformDocument(initialHtml)?.blocks
            .map((block) => block.text.trim())
            .filter(Boolean)
            .join(" ") ?? "",
        archived: false,
        updatedAt: initialUpdatedAt,
        lastSyncedAt: initialUpdatedAt,
        deletedAt: null,
        syncStatus: "synced",
      };

      if (shouldPreferLocal && localPage && !isCancelled && !userEditedBeforeHydration) {
        const localBlocks = getInitialBlocks(localPage.bodyHtml);
        setTitle(localPage.title);
        setBlocks(localBlocks);
        onDocumentLoaded(localBlocks);
        setSyncStatus(localPage.syncStatus);
        lastSyncedAtRef.current =
          localPage.lastSyncedAt ?? localPage.updatedAt ?? initialUpdatedAt;
        lastSavedRevisionRef.current = latestContentRef.current.revision;
      } else if (userEditedBeforeHydration) {
        if (!isCancelled) {
          lastSyncedAtRef.current =
            localPage?.lastSyncedAt ?? localPage?.updatedAt ?? initialUpdatedAt;
          setSyncStatus(localPage?.syncStatus === "failed" ? "failed" : "pending");
        }
      } else {
        try {
          await upsertLocalPage(serverPage);

          if (!isCancelled) {
            setSyncStatus("synced");
            lastSyncedAtRef.current = initialUpdatedAt;
            lastSavedRevisionRef.current = latestContentRef.current.revision;
          }
        } catch (error) {
          console.error("Failed to seed local page state during hydration.", error);
          reportClientError(error, {
            source: "editor.hydration",
            metadata: { pageId },
          });

          if (!isCancelled && isMountedRef.current) {
            setSyncStatus("failed");
          }
        }
      }

      if (!isCancelled) {
        resetDocumentHistory();
        setIsHydrated(true);
      }
    }

    void hydrateFromOfflineStore();

    return () => {
      isCancelled = true;
    };
  }, [
    getInitialBlocks,
    initialHtml,
    initialTitle,
    initialUpdatedAt,
    notebookId,
    onDocumentLoaded,
    pageId,
    resetDocumentHistory,
    setBlocks,
    setTitle,
    userId,
  ]);

  const persistLocalDraft = useCallback(async (reason: string) => {
    if (!isHydrated) {
      return false;
    }

    const pendingContent = latestContentRef.current;

    if (pendingContent.revision === lastSavedRevisionRef.current) {
      if (isMountedRef.current) {
        setIsSavingLocally(false);
      }
      return true;
    }

    try {
      const startedAt = performance.now();
      const { bodyHtml, bodyText } = await serializeEditorContent(
        pendingContent.blocks,
        getBodyText(),
      );
      const updatedAt = new Date().toISOString();
      const localPage: LocalPage = {
        id: pageId,
        userId,
        notebookId,
        title: pendingContent.title,
        bodyHtml,
        bodyText,
        archived: false,
        updatedAt,
        lastSyncedAt: lastSyncedAtRef.current ?? initialUpdatedAt,
        deletedAt: null,
        syncStatus: "pending",
      };

      await upsertLocalPage(localPage);
      await enqueuePageUpsert(localPage, lastSyncedAtRef.current ?? initialUpdatedAt);

      const isCurrentRevision =
        latestContentRef.current.revision === pendingContent.revision;
      if (isCurrentRevision) {
        lastSavedRevisionRef.current = pendingContent.revision;
      }

      if (isMountedRef.current) {
        setSyncStatus("pending");
        setIsSavingLocally(!isCurrentRevision);
      }

      dispatchPageTitleUpdated({
        notebookId,
        pageId,
        title: pendingContent.title,
        updatedAt,
      });
      autosaveFailureCountRef.current = 0;
      reportClientMetric("autosave.duration", performance.now() - startedAt, {
        source: "editor.autosave",
        metadata: { pageId, reason, unit: "ms" },
      });
      return true;
    } catch (error) {
      console.error(`Failed to persist page draft locally during ${reason}.`, error);
      autosaveFailureCountRef.current += 1;
      reportClientMetric("autosave.failures", 1, {
        source: "editor.autosave",
        metadata: {
          pageId,
          reason,
          retryAttempt: autosaveFailureCountRef.current,
        },
      });
      reportClientError(error, {
        source: "editor.autosave",
        metadata: {
          pageId,
          reason,
          retryAttempt: autosaveFailureCountRef.current,
        },
      });

      if (
        isMountedRef.current &&
        latestContentRef.current.revision === pendingContent.revision
      ) {
        setIsSavingLocally(false);
        setSyncStatus("failed");
      }
      return false;
    }
  }, [
    getBodyText,
    initialUpdatedAt,
    isHydrated,
    notebookId,
    pageId,
    userId,
  ]);

  const flushRemoteSync = useCallback(async (reason: string) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    try {
      await processSyncQueue(userId);
      const refreshed = await getLocalPage(userId, pageId);

      if (refreshed?.lastSyncedAt) {
        lastSyncedAtRef.current = refreshed.lastSyncedAt;
      }
      if (refreshed?.syncStatus && isMountedRef.current) {
        setSyncStatus(refreshed.syncStatus);
      }
    } catch (error) {
      console.error(`Failed to sync page draft during ${reason}.`, error);
      reportClientMetric("autosave.sync_failures", 1, {
        source: "editor.autosave",
        metadata: { pageId, reason },
      });
      reportClientError(error, {
        source: "editor.autosave_sync",
        metadata: { pageId, reason },
      });

      if (isMountedRef.current) {
        setSyncStatus((current) => (current === "failed" ? current : "pending"));
        setIsSavingLocally(false);
      }
    }
  }, [pageId, userId]);

  const persistDraftAndSync = useCallback(async (reason: string) => {
    const persisted = await persistLocalDraft(reason);
    if (persisted) {
      await flushRemoteSync(reason);
    }
  }, [flushRemoteSync, persistLocalDraft]);

  const flushPendingSave = useCallback((reason: string) => {
    if (!isHydrated) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (revision === lastSavedRevisionRef.current) {
      if (isMountedRef.current) {
        setIsSavingLocally(false);
      }
      return;
    }

    if (isMountedRef.current) {
      setIsSavingLocally(true);
    }
    void persistDraftAndSync(reason);
  }, [isHydrated, persistDraftAndSync, revision]);

  useEffect(() => {
    if (!isHydrated || revision === lastSavedRevisionRef.current) {
      return;
    }

    setIsSavingLocally(true);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void persistDraftAndSync("autosave");
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isHydrated, persistDraftAndSync, revision]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const handlePageHide = () => flushPendingSave("pagehide");
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingSave("visibilitychange");
      }
    };
    const handleBeforeUnload = () => flushPendingSave("beforeunload");

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushPendingSave("unmount");
    };
  }, [flushPendingSave, isHydrated]);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{
        type?: string;
        userId?: string;
        pageId?: string;
        syncStatus?: SyncStatus;
        lastSyncedAt?: string | null;
      }>;

      if (
        customEvent.detail?.userId !== userId ||
        customEvent.detail?.pageId !== pageId ||
        !customEvent.detail.syncStatus
      ) {
        return;
      }

      setSyncStatus(customEvent.detail.syncStatus);
      if (customEvent.detail.lastSyncedAt) {
        lastSyncedAtRef.current = customEvent.detail.lastSyncedAt;
      }

      if (customEvent.detail.type === "conflict-resolved") {
        void getLocalPage(userId, pageId).then((localPage) => {
          if (!localPage || !isMountedRef.current) {
            return;
          }

          setTitle(localPage.title);
          const localBlocks = getInitialBlocks(localPage.bodyHtml);
          setBlocks(localBlocks);
          onDocumentLoaded(localBlocks);
          lastSavedRevisionRef.current = latestContentRef.current.revision;
          lastSyncedAtRef.current = localPage.lastSyncedAt ?? localPage.updatedAt;
          resetDocumentHistory();
        });
      }
    };

    window.addEventListener("notava-sync", listener);
    return () => window.removeEventListener("notava-sync", listener);
  }, [
    getInitialBlocks,
    onDocumentLoaded,
    pageId,
    resetDocumentHistory,
    setBlocks,
    setTitle,
    userId,
  ]);

  const markEditorInteraction = useCallback(() => {
    if (!isHydrated) {
      userEditedBeforeHydrationRef.current = true;
    }
  }, [isHydrated]);

  const isEditorMounted = useCallback(() => isMountedRef.current, []);

  return {
    flushPendingSave,
    isEditorMounted,
    isHydrated,
    markEditorInteraction,
  };
}
