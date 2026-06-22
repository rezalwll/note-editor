export type PageTitleUpdatedDetail = {
  notebookId: string;
  pageId: string;
  title: string;
  updatedAt: string;
};

export type NotebookRenamedDetail = {
  notebookId: string;
  name: string;
};

export type GroupRenamedDetail = {
  groupId: string;
  name: string;
};

const PAGE_TITLE_UPDATED_EVENT = "notava-page-title-updated";
const NOTEBOOK_RENAMED_EVENT = "notava-notebook-renamed";
const GROUP_RENAMED_EVENT = "notava-group-renamed";

export function dispatchPageTitleUpdated(detail: PageTitleUpdatedDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<PageTitleUpdatedDetail>(PAGE_TITLE_UPDATED_EVENT, { detail }));
}

export function getPageTitleUpdatedEventName() {
  return PAGE_TITLE_UPDATED_EVENT;
}

export function dispatchNotebookRenamed(detail: NotebookRenamedDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<NotebookRenamedDetail>(NOTEBOOK_RENAMED_EVENT, { detail }));
}

export function getNotebookRenamedEventName() {
  return NOTEBOOK_RENAMED_EVENT;
}

export function dispatchGroupRenamed(detail: GroupRenamedDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<GroupRenamedDetail>(GROUP_RENAMED_EVENT, { detail }));
}

export function getGroupRenamedEventName() {
  return GROUP_RENAMED_EVENT;
}
