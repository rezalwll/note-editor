export type PageTitleUpdatedDetail = {
  notebookId: string;
  pageId: string;
  title: string;
  updatedAt: string;
};

const PAGE_TITLE_UPDATED_EVENT = "notava-page-title-updated";

export function dispatchPageTitleUpdated(detail: PageTitleUpdatedDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<PageTitleUpdatedDetail>(PAGE_TITLE_UPDATED_EVENT, { detail }));
}

export function getPageTitleUpdatedEventName() {
  return PAGE_TITLE_UPDATED_EVENT;
}
