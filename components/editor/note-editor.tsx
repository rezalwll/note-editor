"use client";

import { LoaderCircle } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useContextMenu } from "@/components/context-menu";
import { NoteEditorBlock } from "@/components/editor/note-editor-block";
import { NoteEditorHeader } from "@/components/editor/note-editor-header";
import { useNoteEditorBlockActions } from "@/components/editor/use-note-editor-block-actions";
import {
  isEditorControlTarget,
  useNoteEditorCanvasInteractions,
} from "@/components/editor/use-note-editor-canvas-interactions";
import { useNoteEditorClipboard } from "@/components/editor/use-note-editor-clipboard";
import { useNoteEditorCommands } from "@/components/editor/use-note-editor-commands";
import { useNoteEditorHistory } from "@/components/editor/use-note-editor-history";
import { useNoteEditorLayout } from "@/components/editor/use-note-editor-layout";
import { useNoteEditorPersistence } from "@/components/editor/use-note-editor-persistence";
import {
  dispatchEditorCommand,
} from "@/lib/editor-events";
import {
  getCanvasBoundedX,
  getInitialBlocks,
  isImageBlock,
} from "@/lib/editor-document";
import { IncrementalBodyTextIndex } from "@/lib/incremental-body-text";
import { type FreeformBlock } from "@/lib/notes";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { getPageDocumentTitle } from "@/lib/page-title";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type NoteEditorProps = {
  userId: string;
  notebookId: string;
  notebookThemeKey?: string | null;
  pageId: string;
  initialTitle: string;
  initialHtml: string;
  initialUpdatedAt: string;
  attachments: Attachment[];
};

export function NoteEditor({
  userId,
  notebookId,
  notebookThemeKey,
  pageId,
  initialTitle,
  initialHtml,
  initialUpdatedAt,
  attachments: _initialAttachments,
}: NoteEditorProps) {
  const { openMenu } = useContextMenu();
  const notebookTheme = getNotebookTheme(notebookId, notebookThemeKey);
  const displayTimestamp = useMemo(
    () => new Date(initialUpdatedAt),
    [initialUpdatedAt],
  );
  const dateParts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(displayTimestamp);
  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "";
  const year = dateParts.find((part) => part.type === "year")?.value ?? "";
  const persianDateLabel = `${day} ${month} ${year}`;
  const persianTimeLabel = displayTimestamp.toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<FreeformBlock[]>(() =>
    getInitialBlocks(initialHtml),
  );
  const [bodyTextIndex] = useState(() => new IncrementalBodyTextIndex(blocks));
  const [documentRevision, setDocumentRevision] = useState(0);
  const replaceLayoutBlocksBridgeRef = useRef<
    (blocks: readonly FreeformBlock[]) => void
  >(() => undefined);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [richTextInitialSelections, setRichTextInitialSelections] = useState<
    Record<string, { start: number; end: number }>
  >({});
  const [activeRichTextStyle, setActiveRichTextStyle] = useState<{
    blockId: string;
    bold: boolean;
    italic: boolean;
    textColor: string;
    highlightColor: string;
    fontSize: number;
  } | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const textSelectionRef = useRef<
    Record<string, { start: number; end: number }>
  >({});

  const setEditedBlocks = useCallback<
    React.Dispatch<React.SetStateAction<FreeformBlock[]>>
  >((action) => {
    setDocumentRevision((current) => current + 1);
    setBlocks(action);
  }, []);
  const setEditedTitle = useCallback<
    React.Dispatch<React.SetStateAction<string>>
  >((action) => {
    setDocumentRevision((current) => current + 1);
    setTitle(action);
  }, []);
  const applyAutomaticBlockPositions = useCallback(
    (positions: ReadonlyMap<string, number>) => {
      setEditedBlocks((current) =>
        current.map((block) => {
          const nextY = positions.get(block.id);
          return nextY === undefined || nextY === block.y
            ? block
            : { ...block, y: nextY };
        }),
      );
    },
    [setEditedBlocks],
  );
  const replaceDerivedDocumentState = useCallback(
    (nextBlocks: FreeformBlock[]) => {
      bodyTextIndex.replaceAll(nextBlocks);
      replaceLayoutBlocksBridgeRef.current(nextBlocks);
    },
    [bodyTextIndex],
  );
  const getIncrementalBodyText = useCallback(
    () => bodyTextIndex.getText(),
    [bodyTextIndex],
  );
  const {
    currentDocumentStateRef,
    finishHistoryGroup,
    historyRef,
    recordDocumentHistory,
    redoDocument,
    resetDocumentHistory,
    undoDocument,
  } = useNoteEditorHistory({
    title,
    blocks,
    activeBlockId,
    selectedBlockIds,
    pageRef,
    canRecord: () => isHydrated,
    markInteraction: () => markEditorInteraction(),
    setTitle: setEditedTitle,
    setBlocks: setEditedBlocks,
    setActiveBlockId,
    setSelectedBlockIds,
    clearRichTextState: () => {
      setActiveRichTextStyle(null);
      setRichTextInitialSelections({});
    },
    onDocumentApplied: replaceDerivedDocumentState,
  });
  const {
    flushPendingSave,
    isEditorMounted,
    isHydrated,
    markEditorInteraction,
  } = useNoteEditorPersistence({
    userId,
    notebookId,
    pageId,
    initialTitle,
    initialHtml,
    initialUpdatedAt,
    title,
    blocks,
    revision: documentRevision,
    getBodyText: getIncrementalBodyText,
    setTitle,
    setBlocks,
    getInitialBlocks,
    resetDocumentHistory,
    onDocumentLoaded: replaceDerivedDocumentState,
  });
  const {
    blockRefs,
    canvasRef,
    canvasWidth,
    desktopCanvasMinHeight,
    getCanvasRect,
    getTextBlockElement,
    isDesktopViewport,
    mobileCanvasMinHeight,
    queueSelectionRestore,
    renderedBlocks,
    removeLayoutBlocks,
    replaceLayoutBlocks,
    richTextBlockRefs,
    selectionRestoreRef,
    setBlockElement,
    setRichTextBlockHandle,
    shouldVirtualizeBlocks,
    upsertLayoutBlock,
  } = useNoteEditorLayout({
    blocks,
    activeBlockId,
    isHydrated,
    onBlocksDisplaced: applyAutomaticBlockPositions,
  });
  useEffect(() => {
    replaceLayoutBlocksBridgeRef.current = replaceLayoutBlocks;
    return () => {
      replaceLayoutBlocksBridgeRef.current = () => undefined;
    };
  }, [replaceLayoutBlocks]);
  const {
    addBlockAt,
    cycleTodoLines,
    deleteBlock,
    deleteBlocks,
    focusTitleAt,
    handleBlockKeyDown,
    removeBlockIfEmpty,
    restoreTextSelection,
    selectSingleBlock,
    setBlockRef,
    setRichTextBlockRef,
    toggleBlockSelection,
    toggleTodoAtPosition,
    toggleSelectedLines,
    updateBlock,
    updateBlocksByIds,
    updateBlockText,
  } = useNoteEditorBlockActions({
    blocks,
    canvasWidth,
    canvasRef,
    titleInputRef,
    blockRefs,
    richTextBlockRefs,
    selectionRestoreRef,
    bodyTextIndex,
    markEditorInteraction,
    recordDocumentHistory,
    setBlocks,
    setEditedBlocks,
    setActiveBlockId,
    setSelectedBlockIds,
    getTextBlockElement,
    queueSelectionRestore,
    setBlockElement,
    setRichTextBlockHandle,
    upsertLayoutBlock,
    removeLayoutBlocks,
  });
  const {
    getCanvasCoordinates,
    handlePagePointerCancel,
    handlePagePointerDown,
    handlePagePointerUp,
    startDraggingBlock,
    startResizingBlock,
  } = useNoteEditorCanvasInteractions({
    blocks,
    canvasRef,
    pageRef,
    addBlockAt,
    markEditorInteraction,
    recordDocumentHistory,
    selectSingleBlock,
    setEditedBlocks,
    upsertLayoutBlock,
  });
  const {
    copyImageToClipboard,
    copyTextToClipboard,
    getSelectedBlocksText,
    handleEditorPaste,
    handleImageFileSelection,
    imageUploadError,
    pasteFromClipboard,
    pendingImageUploads,
  } = useNoteEditorClipboard({
    pageId,
    canvasWidth,
    blocks,
    activeBlockId,
    title,
    getCanvasRect,
    getTextBlockElement,
    getCanvasBoundedX,
    getCurrentBlocks: () => currentDocumentStateRef.current.blocks,
    getRichTextHandle: (blockId) => richTextBlockRefs.current[blockId] ?? null,
    focusTitleAt,
    restoreTextSelection,
    isEditorMounted,
    markEditorInteraction,
    recordDocumentHistory,
    setTitle: setEditedTitle,
    setBlocks: setEditedBlocks,
    setActiveBlockId,
    setSelectedBlockIds,
    updateBlockText,
    addBlockAt,
    onBlockInserted: (block) => {
      bodyTextIndex.upsert(block);
      upsertLayoutBlock(block);
    },
  });
  const activeBlock =
    blocks.find(
      (block) => block.id === activeBlockId && !isImageBlock(block),
    ) ?? null;

  useEffect(() => {
    document.title = getPageDocumentTitle(title);
  }, [title]);

  const { runEditorCommand } = useNoteEditorCommands({
    activeBlock,
    activeBlockId,
    activeRichTextStyle,
    blocks,
    selectedBlockIds,
    title,
    blockRefs,
    richTextBlockRefs,
    textSelectionRef,
    imageFileInputRef,
    historyRef,
    setRichTextInitialSelections,
    updateBlock,
    updateBlocksByIds,
    toggleSelectedLines,
    cycleTodoLines,
    deleteBlocks,
    undoDocument,
    redoDocument,
  });

  return (
    <div
      className="h-full min-h-0 bg-white xl:pt-[6px]"
      onPaste={handleEditorPaste}
    >
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleImageFileSelection}
      />
      <div className="min-h-full w-full xl:h-full xl:min-h-0">
        <div
          ref={pageRef}
          data-testid="note-editor-scroll-area"
          onPointerDown={handlePagePointerDown}
          onPointerUp={handlePagePointerUp}
          onPointerCancel={handlePagePointerCancel}
          className="editor-page-scrollbar flex min-h-full flex-col overflow-visible border-0 bg-white pb-36 pt-0 md:h-[calc(100dvh-176px)] md:min-h-0 md:overflow-y-auto md:overscroll-contain md:rounded-[10px] md:border md:pb-0 md:pt-4 xl:h-full"
          style={{
            borderColor: notebookTheme.editorBorder,
            boxShadow: `0 1px 0 rgba(0,0,0,0.04), 0 14px 36px ${notebookTheme.editorGlow}`,
          }}
        >
          <NoteEditorHeader
            accentColor={notebookTheme.accent}
            dateLabel={persianDateLabel}
            timeLabel={persianTimeLabel}
            title={title}
            titleInputRef={titleInputRef}
            onTitleChange={(nextTitle) => {
              markEditorInteraction();
              recordDocumentHistory("title");
              setEditedTitle(nextTitle);
            }}
            onTitleBlur={() => {
              finishHistoryGroup();
              flushPendingSave("title-blur");
            }}
            onCopyTitle={copyTextToClipboard}
            onPasteTitle={(selectionStart, selectionEnd) =>
              pasteFromClipboard({
                targetTitle: true,
                selectionStart,
                selectionEnd,
              })
            }
          />

          <div
            ref={canvasRef}
            data-testid="note-canvas"
            data-layout-mode="freeform"
            data-virtualized={shouldVirtualizeBlocks ? "true" : "false"}
            data-rendered-block-count={renderedBlocks.length}
            data-total-block-count={blocks.length}
            className="freeform-canvas relative flex-1 bg-white"
            style={{
              minHeight: `${
                isDesktopViewport ? desktopCanvasMinHeight : mobileCanvasMinHeight
              }px`,
            }}
            onContextMenu={(event) => {
              const target = event.target as HTMLElement;

              if (isEditorControlTarget(target)) {
                return;
              }

              const coordinates = getCanvasCoordinates(
                event.clientX,
                event.clientY,
              );

              if (!coordinates) {
                return;
              }

              event.preventDefault();
              const selectedText = getSelectedBlocksText(selectedBlockIds);
              openMenu(event, {
                title:
                  selectedBlockIds.length > 1
                    ? `${selectedBlockIds.length} بلوک انتخاب شده`
                    : "ویرایشگر",
                items:
                  selectedBlockIds.length > 1
                    ? [
                        {
                          id: "copy-selected-blocks",
                          label: "کپی",
                          disabled: !selectedText,
                          onSelect: () =>
                            copyTextToClipboard(selectedText),
                        },
                        {
                          id: "paste-at-position",
                          label: "پیست",
                          onSelect: () =>
                            pasteFromClipboard({ placement: coordinates }),
                        },
                        { id: "separator-clipboard", separator: true },
                        {
                          id: "new-block",
                          label: "افزودن بلوک متن در اینجا",
                          onSelect: () =>
                            addBlockAt(coordinates.x, coordinates.y, true, coordinates.width),
                        },
                        { id: "separator-1", separator: true },
                        {
                          id: "delete-selected-blocks",
                          label: "حذف بلوک‌های انتخاب‌شده",
                          danger: true,
                          onSelect: () => deleteBlocks(selectedBlockIds),
                        },
                        {
                          id: "clear-selection",
                          label: "پاک کردن انتخاب",
                          onSelect: () => setSelectedBlockIds([]),
                        },
                      ]
                    : [
                        {
                          id: "copy-selected-block",
                          label: "کپی",
                          disabled: !selectedText,
                          onSelect: () =>
                            copyTextToClipboard(selectedText),
                        },
                        {
                          id: "paste-at-position",
                          label: "پیست",
                          onSelect: () =>
                            pasteFromClipboard({ placement: coordinates }),
                        },
                        { id: "separator-clipboard", separator: true },
                        {
                          id: "new-block",
                          label: "افزودن بلوک متن در اینجا",
                          onSelect: () =>
                            addBlockAt(coordinates.x, coordinates.y, true, coordinates.width),
                        },
                      ],
              });
            }}
          >
            <div
              className="pointer-events-none sticky top-3 z-30 flex justify-end px-4 md:px-8"
              aria-live="polite"
            >
              {pendingImageUploads > 0 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#b9d9c6] bg-white/95 px-3 py-1.5 text-xs font-medium text-[#35674a] shadow-sm">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  در حال بارگذاری تصویر
                </span>
              ) : imageUploadError ? (
                <span className="rounded-full border border-[#f0b8b8] bg-white/95 px-3 py-1.5 text-xs font-medium text-[#a43f3f] shadow-sm">
                  {imageUploadError}
                </span>
              ) : null}
            </div>

{renderedBlocks.map((block) => (
              <NoteEditorBlock
                key={block.id}
                block={block}
                canvasWidth={canvasWidth}
                selectedBlockIds={selectedBlockIds}
                notebookTheme={notebookTheme}
                richTextInitialSelections={richTextInitialSelections}
                setBlockRef={setBlockRef}
                setRichTextBlockRef={setRichTextBlockRef}
                textSelectionRef={textSelectionRef}
                getCanvasBoundedX={getCanvasBoundedX}
                selectSingleBlock={selectSingleBlock}
                startDraggingBlock={startDraggingBlock}
                startResizingBlock={startResizingBlock}
                copyImageToClipboard={copyImageToClipboard}
                pasteFromClipboard={pasteFromClipboard}
                deleteBlock={deleteBlock}
                updateBlock={updateBlock}
                finishHistoryGroup={finishHistoryGroup}
                removeBlockIfEmpty={removeBlockIfEmpty}
                flushPendingSave={flushPendingSave}
                updateBlockText={updateBlockText}
                setActiveRichTextStyle={setActiveRichTextStyle}
                openMenu={openMenu}
                copyTextToClipboard={copyTextToClipboard}
                handleBlockKeyDown={handleBlockKeyDown}
                toggleBlockSelection={toggleBlockSelection}
                toggleTodoAtPosition={toggleTodoAtPosition}
                getSelectedBlocksText={getSelectedBlocksText}
                runEditorCommand={runEditorCommand}
                setSelectedBlockIds={setSelectedBlockIds}
              />
            ))}

            {blocks.length === 0 ? (
              <div className="px-4 py-8 text-right text-sm text-[#8b8b8b] md:px-[48px]">
                روی هرجای صفحه کلیک کنید و نوشتن را شروع کنید.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
