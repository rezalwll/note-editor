"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";

import { MobileShellNavigation } from "@/components/mobile-shell-navigation";
import {
  MobileActionSheet,
  MobileCreateMenu,
  MobileProfileMenu,
} from "@/components/mobile-shell-overlays";
import { MobilePagesPanel } from "@/components/mobile-shell-pages-panel";
import { MobileSectionsPanel } from "@/components/mobile-shell-sections-panel";
import type {
  InstallPromptEvent,
  MobileCurrentUser,
} from "@/components/mobile-shell-types";
import {
  type ActionSheetState,
  type MobileGroupSection,
  type MobileNotebook,
} from "@/components/use-mobile-shell-model";
import type { NotebookTheme } from "@/lib/notebook-theme";

type MobileShellViewProps = {
  actionGroup: MobileGroupSection | null;
  actionNotebook: MobileNotebook | null;
  actionPage: MobileNotebook["pages"][number] | null;
  actionSheet: ActionSheetState;
  activeGroup: MobileGroupSection | null;
  activeGroupId: string | null;
  activeGroupNotebooks: MobileNotebook[];
  activeNotebook: MobileNotebook | null;
  activeTheme: NotebookTheme;
  archivePage: (pageId: string) => void;
  beginCreateNotebook: (groupId: string) => void;
  beginRenameGroup: (group: MobileGroupSection) => void;
  beginRenameNotebook: (notebook: MobileNotebook) => void;
  cancelCreateNotebook: () => void;
  closeActionSheet: () => void;
  closeAll: () => void;
  createMenuOpen: boolean;
  currentUser: MobileCurrentUser;
  creatingNotebookGroupId: string | null;
  deleteGroup: (group: MobileGroupSection) => void;
  deleteNotebook: (notebook: MobileNotebook) => void;
  deletePagePermanently: (pageId: string) => void;
  draftGroupName: string;
  draftNotebookName: string;
  draftTitle: string;
  editingGroupId: string | null;
  editingNotebookId: string | null;
  expandedGroupIds: string[];
  groupedNotebooks: MobileGroupSection[];
  groupInputRef: RefObject<HTMLInputElement | null>;
  handleInstall: (event: InstallPromptEvent) => Promise<void>;
  inputRef: RefObject<HTMLInputElement | null>;
  installEvent: InstallPromptEvent | null;
  isCreating: boolean;
  isCreatingGroup: boolean;
  isPending: boolean;
  logoutAndClearClientData: () => Promise<void>;
  notebookInputRef: RefObject<HTMLInputElement | null>;
  pagesOpen: boolean;
  pathname: string;
  profileMenuRef: RefObject<HTMLDivElement | null>;
  profileOpen: boolean;
  profilePanelPosition: { top: number; left: number };
  profileTriggerRef: RefObject<HTMLButtonElement | null>;
  restorePage: (pageId: string) => void;
  sectionsOpen: boolean;
  selectNotebook: (notebook: MobileNotebook) => void;
  setActionSheet: Dispatch<SetStateAction<ActionSheetState>>;
  setCreateMenuOpen: Dispatch<SetStateAction<boolean>>;
  setDraftGroupName: Dispatch<SetStateAction<string>>;
  setDraftNotebookName: Dispatch<SetStateAction<string>>;
  setDraftTitle: Dispatch<SetStateAction<string>>;
  setEditingGroupId: Dispatch<SetStateAction<string | null>>;
  setEditingNotebookId: Dispatch<SetStateAction<string | null>>;
  setIsCreating: Dispatch<SetStateAction<boolean>>;
  setIsCreatingGroup: Dispatch<SetStateAction<boolean>>;
  setPagesOpen: Dispatch<SetStateAction<boolean>>;
  setProfileOpen: Dispatch<SetStateAction<boolean>>;
  setSectionsOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedNotebookId: Dispatch<SetStateAction<string | null>>;
  submitCreate: () => void;
  submitCreateGroup: () => void;
  submitCreateNotebook: () => void;
  submitRenameGroup: () => void;
  submitRenameNotebook: () => void;
  startCreateGroup: () => void;
  startCreateNotebook: () => void;
  startCreatePage: () => void;
  toggleGroupSelection: (groupId: string) => void;
};

export function MobileShellView({
  actionGroup,
  actionNotebook,
  actionPage,
  actionSheet,
  activeGroup,
  activeGroupId,
  activeGroupNotebooks,
  activeNotebook,
  activeTheme,
  archivePage,
  beginCreateNotebook,
  beginRenameGroup,
  beginRenameNotebook,
  cancelCreateNotebook,
  closeActionSheet,
  closeAll,
  createMenuOpen,
  currentUser,
  creatingNotebookGroupId,
  deleteGroup,
  deleteNotebook,
  deletePagePermanently,
  draftGroupName,
  draftNotebookName,
  draftTitle,
  editingGroupId,
  editingNotebookId,
  expandedGroupIds,
  groupedNotebooks,
  groupInputRef,
  handleInstall,
  inputRef,
  installEvent,
  isCreating,
  isCreatingGroup,
  isPending,
  logoutAndClearClientData,
  notebookInputRef,
  pagesOpen,
  pathname,
  profileMenuRef,
  profileOpen,
  profilePanelPosition,
  profileTriggerRef,
  restorePage,
  sectionsOpen,
  selectNotebook,
  setActionSheet,
  setCreateMenuOpen,
  setDraftGroupName,
  setDraftNotebookName,
  setDraftTitle,
  setEditingGroupId,
  setEditingNotebookId,
  setIsCreating,
  setIsCreatingGroup,
  setPagesOpen,
  setProfileOpen,
  setSectionsOpen,
  setSelectedNotebookId,
  submitCreate,
  submitCreateGroup,
  submitCreateNotebook,
  submitRenameGroup,
  submitRenameNotebook,
  startCreateGroup,
  startCreateNotebook,
  startCreatePage,
  toggleGroupSelection,
}: MobileShellViewProps) {
  return (
    <div className="xl:hidden">
      <MobileShellNavigation
        activeGroup={activeGroup}
        activeNotebook={activeNotebook}
        createMenuOpen={createMenuOpen}
        currentUser={currentUser}
        pathname={pathname}
        profileTriggerRef={profileTriggerRef}
        setCreateMenuOpen={setCreateMenuOpen}
        setPagesOpen={setPagesOpen}
        setProfileOpen={setProfileOpen}
        setSectionsOpen={setSectionsOpen}
      />

      {sectionsOpen ? (
        <MobileSectionsPanel
          activeGroupId={activeGroupId}
          activeNotebook={activeNotebook}
          beginCreateNotebook={beginCreateNotebook}
          cancelCreateNotebook={cancelCreateNotebook}
          closeAll={closeAll}
          creatingNotebookGroupId={creatingNotebookGroupId}
          draftGroupName={draftGroupName}
          draftNotebookName={draftNotebookName}
          editingGroupId={editingGroupId}
          editingNotebookId={editingNotebookId}
          expandedGroupIds={expandedGroupIds}
          groupedNotebooks={groupedNotebooks}
          groupInputRef={groupInputRef}
          isCreatingGroup={isCreatingGroup}
          isPending={isPending}
          notebookInputRef={notebookInputRef}
          selectNotebook={selectNotebook}
          setActionSheet={setActionSheet}
          setDraftGroupName={setDraftGroupName}
          setDraftNotebookName={setDraftNotebookName}
          setEditingGroupId={setEditingGroupId}
          setEditingNotebookId={setEditingNotebookId}
          setIsCreatingGroup={setIsCreatingGroup}
          submitCreateGroup={submitCreateGroup}
          submitCreateNotebook={submitCreateNotebook}
          submitRenameGroup={submitRenameGroup}
          submitRenameNotebook={submitRenameNotebook}
          toggleGroupSelection={toggleGroupSelection}
        />
      ) : null}

      {pagesOpen ? (
        <MobilePagesPanel
          activeGroup={activeGroup}
          activeGroupNotebooks={activeGroupNotebooks}
          activeNotebook={activeNotebook}
          activeTheme={activeTheme}
          closeAll={closeAll}
          draftTitle={draftTitle}
          inputRef={inputRef}
          isCreating={isCreating}
          isPending={isPending}
          pathname={pathname}
          setActionSheet={setActionSheet}
          setDraftTitle={setDraftTitle}
          setIsCreating={setIsCreating}
          setSelectedNotebookId={setSelectedNotebookId}
          submitCreate={submitCreate}
        />
      ) : null}

      {actionSheet ? (
        <MobileActionSheet
          actionGroup={actionGroup}
          actionNotebook={actionNotebook}
          actionPage={actionPage}
          activeNotebook={activeNotebook}
          archivePage={archivePage}
          beginRenameGroup={beginRenameGroup}
          beginRenameNotebook={beginRenameNotebook}
          close={closeActionSheet}
          deleteGroup={deleteGroup}
          deleteNotebook={deleteNotebook}
          deletePagePermanently={deletePagePermanently}
          restorePage={restorePage}
        />
      ) : null}

      {createMenuOpen ? (
        <MobileCreateMenu
          canCreateNotebook={Boolean(
            activeGroup && !activeGroup.systemKey,
          )}
          canCreatePage={Boolean(activeNotebook && !activeNotebook.deletedAt)}
          close={() => setCreateMenuOpen(false)}
          createGroup={startCreateGroup}
          createNotebook={startCreateNotebook}
          createPage={startCreatePage}
        />
      ) : null}

      {profileOpen ? (
        <MobileProfileMenu
          closeAll={closeAll}
          currentUser={currentUser}
          handleInstall={handleInstall}
          installEvent={installEvent}
          logoutAndClearClientData={logoutAndClearClientData}
          position={profilePanelPosition}
          profileMenuRef={profileMenuRef}
        />
      ) : null}
    </div>
  );

}
