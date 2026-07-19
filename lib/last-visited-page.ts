const LAST_VISITED_PAGE_COOKIE_PREFIX = "notava_last_page_";

export const LAST_VISITED_PAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function getLastVisitedPageCookieName(userId: string) {
  return `${LAST_VISITED_PAGE_COOKIE_PREFIX}${userId}`;
}

export function getPageIdFromPathname(pathname: string) {
  return /^\/pages\/([a-zA-Z0-9_-]+)\/?$/.exec(pathname)?.[1] ?? null;
}
