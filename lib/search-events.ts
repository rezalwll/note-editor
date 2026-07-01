const OPEN_SEARCH_EVENT = "notava-search-open";

export function getOpenSearchEventName() {
  return OPEN_SEARCH_EVENT;
}

export function dispatchOpenSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}
