export function normalizeUsername(value: string) {
  return value.trim();
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getUserInitials(displayName: string) {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "U";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

export function getUserAccent(username: string) {
  const palette = [
    "#1098c5",
    "#8f95ff",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#a855f7",
  ];
  let hash = 0;

  for (const char of username) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return palette[hash % palette.length];
}
