"use client";

import { Plus } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { SectionGroupTabs } from "@/components/section-group-tabs";
import { SectionNotebookTabs } from "@/components/section-notebook-tabs";
import {
  type NotebookGroupTab,
  type NotebookTab,
} from "@/components/section-tabs-model";
import {
  getNotebookTheme,
  type ThemeKey,
} from "@/lib/notebook-theme";

type SectionTabsViewProps = {
  activeGroupKey: string | null;
  activeGroupNotebooks: NotebookTab[];
  activeNotebookId: string | null;
  beginCreateGroup: () => void;
  beginCreateNotebook: () => void;
  beginRenameGroup: (groupId: string, groupName: string) => void;
  beginRenameNotebook: (notebook: NotebookTab) => void;
  cancelGroupEdit: () => void;
  cancelNotebookEdit: () => void;
  clearTrash: () => void;
  deleteGroup: (groupId: string) => void;
  deleteNotebooks: (notebookIds: string[], permanently?: boolean) => void;
  draftGroupName: string;
  draftName: string;
  draftNotebook: NotebookTab | null;
  draggedGroupId: string | null;
  draggedNotebookId: string | null;
  editingGroupId: string | null;
  editingNotebookId: string | null;
  groupInputRef: RefObject<HTMLInputElement | null>;
  groupItems: NotebookGroupTab[];
  groupTabs: NotebookGroupTab[];
  handleGroupDrop: (targetGroupId: string) => void;
  handleNotebookDrop: (targetNotebookId: string) => void;
  hasWritableGroup: boolean;
  isOverflowOpen: boolean;
  isPending: boolean;
  isTrashGroup: (groupId: string | null | undefined) => boolean;
  measureRef: RefObject<HTMLDivElement | null>;
  moveNotebooksToGroup: (
    notebookIds: string[],
    groupId: string | null,
  ) => void;
  notebookInputRef: RefObject<HTMLInputElement | null>;
  overflowNotebooks: NotebookTab[];
  selectedNotebookIds: string[];
  setDraftGroupName: Dispatch<SetStateAction<string>>;
  setDraftName: Dispatch<SetStateAction<string>>;
  setDraggedGroupId: Dispatch<SetStateAction<string | null>>;
  setDraggedNotebookId: Dispatch<SetStateAction<string | null>>;
  setIsOverflowOpen: Dispatch<SetStateAction<boolean>>;
  setManualGroupKey: Dispatch<SetStateAction<string | null>>;
  setSelectedNotebookIds: Dispatch<SetStateAction<string[]>>;
  submitGroupRename: () => void;
  submitNotebookRename: () => void;
  toggleNotebookSelection: (notebookId: string) => void;
  selectSingleNotebook: (notebookId: string) => void;
  updateGroupTheme: (groupId: string, themeKey: ThemeKey) => void;
  updateNotebookTheme: (notebookId: string, themeKey: ThemeKey) => void;
  visibleNotebooks: NotebookTab[];
};

export function SectionTabsView({
  activeGroupKey,
  activeGroupNotebooks,
  activeNotebookId,
  beginCreateGroup,
  beginCreateNotebook,
  beginRenameGroup,
  beginRenameNotebook,
  cancelGroupEdit,
  cancelNotebookEdit,
  clearTrash,
  deleteGroup,
  deleteNotebooks,
  draftGroupName,
  draftName,
  draftNotebook,
  draggedGroupId,
  draggedNotebookId,
  editingGroupId,
  editingNotebookId,
  groupInputRef,
  groupItems,
  groupTabs,
  handleGroupDrop,
  handleNotebookDrop,
  hasWritableGroup,
  isOverflowOpen,
  isPending,
  isTrashGroup,
  measureRef,
  moveNotebooksToGroup,
  notebookInputRef,
  overflowNotebooks,
  selectedNotebookIds,
  setDraftGroupName,
  setDraftName,
  setDraggedGroupId,
  setDraggedNotebookId,
  setIsOverflowOpen,
  setManualGroupKey,
  setSelectedNotebookIds,
  submitGroupRename,
  submitNotebookRename,
  toggleNotebookSelection,
  selectSingleNotebook,
  updateGroupTheme,
  updateNotebookTheme,
  visibleNotebooks,
}: SectionTabsViewProps) {
  return (
    <div className="relative border-b border-[var(--border-soft)] bg-white/95 px-3 pb-2 pt-2 backdrop-blur">
      <div
        ref={measureRef}
        className="invisible absolute left-0 right-0 top-0 -z-10 flex flex-wrap items-end gap-1 px-3 pt-2"
      >
        {activeGroupNotebooks.map((notebook) => {
          const theme = getNotebookTheme(notebook.id, notebook.themeKey);

          return (
            <div
              key={`measure-${notebook.id}`}
              data-measure-notebook-id={notebook.id}
              className="inline-flex h-6 items-center rounded-t-md px-4 text-xs"
              style={{
                backgroundColor: theme.tab,
                color: theme.tabText,
              }}
            >
              {notebook.name || "زیر مجموعه بدون عنوان"}
            </div>
          );
        })}
        {!isTrashGroup(activeGroupKey) && hasWritableGroup ? (
          <div className="flex h-6 w-9 items-center justify-center rounded-t-md border border-stone-300 bg-white text-stone-700">
            <Plus className="h-4 w-4" />
          </div>
        ) : null}
      </div>

      <SectionGroupTabs
        activeGroupKey={activeGroupKey}
        beginCreateGroup={beginCreateGroup}
        beginRenameGroup={beginRenameGroup}
        cancelGroupEdit={cancelGroupEdit}
        clearTrash={clearTrash}
        deleteGroup={deleteGroup}
        draftGroupName={draftGroupName}
        draggedGroupId={draggedGroupId}
        editingGroupId={editingGroupId}
        groupInputRef={groupInputRef}
        groupTabs={groupTabs}
        handleGroupDrop={handleGroupDrop}
        setDraftGroupName={setDraftGroupName}
        setDraggedGroupId={setDraggedGroupId}
        setManualGroupKey={setManualGroupKey}
        submitGroupRename={submitGroupRename}
        updateGroupTheme={updateGroupTheme}
      />

      <SectionNotebookTabs
        activeGroupKey={activeGroupKey}
        activeNotebookId={activeNotebookId}
        beginCreateGroup={beginCreateGroup}
        beginCreateNotebook={beginCreateNotebook}
        beginRenameNotebook={beginRenameNotebook}
        cancelNotebookEdit={cancelNotebookEdit}
        deleteNotebooks={deleteNotebooks}
        draftName={draftName}
        draftNotebook={draftNotebook}
        draggedNotebookId={draggedNotebookId}
        editingNotebookId={editingNotebookId}
        groupItems={groupItems}
        handleNotebookDrop={handleNotebookDrop}
        hasWritableGroup={hasWritableGroup}
        isOverflowOpen={isOverflowOpen}
        isPending={isPending}
        isTrashGroup={isTrashGroup}
        moveNotebooksToGroup={moveNotebooksToGroup}
        notebookInputRef={notebookInputRef}
        overflowNotebooks={overflowNotebooks}
        selectedNotebookIds={selectedNotebookIds}
        selectSingleNotebook={selectSingleNotebook}
        setDraftName={setDraftName}
        setDraggedNotebookId={setDraggedNotebookId}
        setIsOverflowOpen={setIsOverflowOpen}
        setManualGroupKey={setManualGroupKey}
        setSelectedNotebookIds={setSelectedNotebookIds}
        submitNotebookRename={submitNotebookRename}
        toggleNotebookSelection={toggleNotebookSelection}
        updateNotebookTheme={updateNotebookTheme}
        visibleNotebooks={visibleNotebooks}
      />
    </div>
  );
}
