"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type WorkspaceHistoryEntry = {
  label: string;
  undo: () => unknown | Promise<unknown>;
  redo: () => unknown | Promise<unknown>;
};

type WorkspaceHistoryContextValue = {
  canUndo: boolean;
  canRedo: boolean;
  isApplying: boolean;
  record: (entry: WorkspaceHistoryEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
};

const noOpAsync = async () => {};
const WorkspaceHistoryContext = createContext<WorkspaceHistoryContextValue>({
  canUndo: false,
  canRedo: false,
  isApplying: false,
  record: () => {},
  undo: noOpAsync,
  redo: noOpAsync,
  clear: () => {},
});

const MAX_HISTORY_LENGTH = 100;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

export function WorkspaceHistoryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pastRef = useRef<WorkspaceHistoryEntry[]>([]);
  const futureRef = useRef<WorkspaceHistoryEntry[]>([]);
  const applyingRef = useRef(false);
  const [isApplying, setIsApplying] = useState(false);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
    undoLabel: null as string | null,
    redoLabel: null as string | null,
  });

  const notify = useCallback(() => {
    setHistoryState({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
      undoLabel: pastRef.current.at(-1)?.label ?? null,
      redoLabel: futureRef.current.at(-1)?.label ?? null,
    });
  }, []);

  const record = useCallback(
    (entry: WorkspaceHistoryEntry) => {
      if (applyingRef.current) {
        return;
      }

      pastRef.current = [...pastRef.current, entry].slice(-MAX_HISTORY_LENGTH);
      futureRef.current = [];
      notify();
    },
    [notify],
  );

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    notify();
  }, [notify]);

  const apply = useCallback(
    async (direction: "undo" | "redo") => {
      if (applyingRef.current) {
        return;
      }

      const source = direction === "undo" ? pastRef.current : futureRef.current;
      const destination = direction === "undo" ? futureRef : pastRef;
      const entry = source.pop();
      if (!entry) {
        return;
      }

      applyingRef.current = true;
      setIsApplying(true);
      notify();

      try {
        await (direction === "undo" ? entry.undo() : entry.redo());
        destination.current.push(entry);
        router.refresh();
      } catch (error) {
        source.push(entry);
        console.error(`Workspace ${direction} failed.`, error);
      } finally {
        applyingRef.current = false;
        setIsApplying(false);
        notify();
      }
    },
    [notify, router],
  );

  const undo = useCallback(() => apply("undo"), [apply]);
  const redo = useCallback(() => apply("redo"), [apply]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const shouldUndo = key === "z" && !event.shiftKey;
      const shouldRedo = key === "y" || (key === "z" && event.shiftKey);
      if (!shouldUndo && !shouldRedo) {
        return;
      }

      const canApply = shouldUndo
        ? pastRef.current.length > 0
        : futureRef.current.length > 0;
      if (!canApply) {
        return;
      }

      event.preventDefault();
      void (shouldUndo ? undo() : redo());
    };

    const handleCommand = (event: Event) => {
      const command = (event as CustomEvent<{ command?: "undo" | "redo" }>).detail
        ?.command;
      if (command === "undo") {
        void undo();
      } else if (command === "redo") {
        void redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("notava-workspace-history-command", handleCommand);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("notava-workspace-history-command", handleCommand);
    };
  }, [redo, undo]);

  const { canUndo, canRedo } = historyState;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("notava-workspace-history-state", {
        detail: {
          canUndo,
          canRedo,
          isApplying,
          undoLabel: historyState.undoLabel,
          redoLabel: historyState.redoLabel,
        },
      }),
    );
  }, [canRedo, canUndo, historyState.redoLabel, historyState.undoLabel, isApplying]);

  const value = useMemo(
    () => ({ canUndo, canRedo, isApplying, record, undo, redo, clear }),
    [canRedo, canUndo, clear, isApplying, record, redo, undo],
  );

  return (
    <WorkspaceHistoryContext.Provider value={value}>
      {children}
    </WorkspaceHistoryContext.Provider>
  );
}

export function useWorkspaceHistory() {
  return useContext(WorkspaceHistoryContext);
}
