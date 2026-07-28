const PRIVATE_ID_ROUTES = new Set(["pages", "notebooks"]);

export function normalizeAnalyticsPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }

  const pathname = value.split("?")[0].slice(0, 240);
  const segments = pathname.split("/").filter(Boolean);
  const normalizedSegments = segments.map((segment, index) => {
    const previous = segments[index - 1];
    if (
      previous &&
      (PRIVATE_ID_ROUTES.has(previous) || previous === "support")
    ) {
      return ":id";
    }
    return segment;
  });

  return normalizedSegments.length > 0
    ? `/${normalizedSegments.join("/")}`
    : "/";
}

export function getUtcDay(value = new Date()) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function formatUsageDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours.toLocaleString("fa-IR")} ساعت و ${minutes.toLocaleString(
      "fa-IR",
    )} دقیقه`;
  }
  return `${Math.max(1, minutes).toLocaleString("fa-IR")} دقیقه`;
}
