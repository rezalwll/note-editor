const APP_NAME = "notava";

function withAppName(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? `${trimmed} | ${APP_NAME}` : APP_NAME;
}

export function getPageDocumentTitle(_title?: string | null) {
  return APP_NAME;
}

export function getNotebookDocumentTitle(name?: string | null) {
  return withAppName(name?.trim() || "دفتر بدون عنوان");
}

export function getSectionDocumentTitle(title?: string | null) {
  return withAppName(title);
}
