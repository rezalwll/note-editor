"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  enqueuePageUpsert,
  getLocalPage,
  upsertLocalPage,
} from "@/lib/offline-db/client";
import type { LocalPage, SyncStatus } from "@/lib/offline-db/types";
import { parseFreeformDocument, type FreeformBlock } from "@/lib/notes";
import { dispatchPageTitleUpdated } from "@/lib/page-events";
import { processSyncQueue } from "@/lib/sync/client";

const AUTOSAVE_DEBOUNCE_MS = 150;

type UseNoteEditorPersistenceOptions = {
  userId: string;
  notebookId: string;
  pageId: string;
  initialTitle: string;
  initialHtml: string;
  initialUpdatedAt: string;
  title: string;
  bodyText: string;
  serializedDocument: string;
  snapshot: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setBlocks: React.Dispatch<React.SetStateAction<FreeformBlock[]>>;
  getInitialBlocks: (html: string) => FreeformBlock[];
  resetDocumentHistory: () => void;
};

export function useNoteEditorPersistence({
  userId,
  notebookId,
  pageId,
  initialTitle,
  initialHtml,
  initialUpdatedAt,
  title,
  bodyText,
  serializedDocument,
  snapshot,
  setTitle,
  setBlocks,
  getInitialBlocks,
  resetDocumentHistory,
}: UseNoteEditorPersistenceOptions) {
  const [, setSyncStatus] = useState<SyncStatus>("synced");
  const [, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [, setIsSavingLocally] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef("");
  const lastSyncedAtRef = useRef(initialUpdatedAt);
  const latestSnapshotRef = useRef("");
  const isMountedRef = useRef(true);
  const userEditedBeforeHydrationRef = useRef(false);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

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
        setTitle(localPage.title);
        setBlocks(getInitialBlocks(localPage.bodyHtml));
        setSyncStatus(localPage.syncStatus);
        lastSyncedAtRef.current =
          localPage.lastSyncedAt ?? localPage.updatedAt ?? initialUpdatedAt;
        lastSavedSnapshotRef.current = `${localPage.title}::${localPage.bodyHtml}`;
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
            lastSavedSnapshotRef.current = `${initialTitle}::${initialHtml}`;
          }
        } catch (error) {
          console.error("Failed to seed local page state during hydration.", error);

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

    const pendingSnapshot = snapshot;

    if (pendingSnapshot === lastSavedSnapshotRef.current) {
      if (isMountedRef.current) {
        setIsSavingLocally(false);
      }
      return true;
    }

    try {
      const updatedAt = new Date().toISOString();
      const localPage: LocalPage = {
        id: pageId,
        userId,
        notebookId,
        title,
        bodyHtml: serializedDocument,
        bodyText,
        archived: false,
        updatedAt,
        lastSyncedAt: lastSyncedAtRef.current ?? initialUpdatedAt,
        deletedAt: null,
        syncStatus: "pending",
      };

      await upsertLocalPage(localPage);
      await enqueuePageUpsert(localPage, lastSyncedAtRef.current ?? initialUpdatedAt);

      const isCurrentSnapshot = latestSnapshotRef.current === pendingSnapshot;
      if (isCurrentSnapshot) {
        lastSavedSnapshotRef.current = pendingSnapshot;
      }

      if (isMountedRef.current) {
        setSyncStatus("pending");
        setIsSavingLocally(!isCurrentSnapshot);
      }

      dispatchPageTitleUpdated({ notebookId, pageId, title, updatedAt });
      return true;
    } catch (error) {
      console.error(`Failed to persist page draft locally during ${reason}.`, error);

      if (isMountedRef.current && latestSnapshotRef.current === pendingSnapshot) {
        setIsSavingLocally(false);
        setSyncStatus("failed");
      }
      return false;
    }
  }, [
    bodyText,
    initialUpdatedAt,
    isHydrated,
    notebookId,
    pageId,
    serializedDocument,
    snapshot,
    title,
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

    if (snapshot === lastSavedSnapshotRef.current) {
      if (isMountedRef.current) {
        setIsSavingLocally(false);
      }
      return;
    }

    if (isMountedRef.current) {
      setIsSavingLocally(true);
    }
    void persistDraftAndSync(reason);
  }, [isHydrated, persistDraftAndSync, snapshot]);

  useEffect(() => {
    if (!isHydrated || snapshot === lastSavedSnapshotRef.current) {
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
  }, [isHydrated, persistDraftAndSync, snapshot]);

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
          setBlocks(getInitialBlocks(localPage.bodyHtml));
          lastSavedSnapshotRef.current = `${localPage.title}::${localPage.bodyHtml}`;
          lastSyncedAtRef.current = localPage.lastSyncedAt ?? localPage.updatedAt;
          resetDocumentHistory();
        });
      }
    };

    window.addEventListener("notava-sync", listener);
    return () => window.removeEventListener("notava-sync", listener);
  }, [getInitialBlocks, pageId, resetDocumentHistory, setBlocks, setTitle, userId]);

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
