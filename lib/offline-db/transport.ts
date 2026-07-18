import { getLastPullAt } from "@/lib/offline-db/state";
import type {
  SyncBootstrapPayload,
  SyncPushResult,
  SyncQueueItem,
} from "@/lib/offline-db/types";

export async function fetchBootstrap(
  cursor?: string | null,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/sync/bootstrap${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error("BOOTSTRAP_FAILED");
  }

  return (await response.json()) as SyncBootstrapPayload;
}

export async function fetchPullChanges(
  userId: string,
  cursor?: string | null,
  signal?: AbortSignal,
) {
  const since = cursor ? null : await getLastPullAt(userId);
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}`
    : since
      ? `?since=${encodeURIComponent(since)}`
      : "";
  const response = await fetch(
    `/api/sync/pull${query}`,
    {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error("PULL_FAILED");
  }

  return (await response.json()) as SyncBootstrapPayload;
}

export async function pushQueue(items: SyncQueueItem[], signal?: AbortSignal) {
  const response = await fetch("/api/sync/push", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: items }),
    signal,
  });

  if (!response.ok) {
    let detail = "";

    try {
      const payload = (await response.json()) as {
        error?: string;
        issues?: Array<{ path?: string; message?: string }>;
      };
      const issueText = payload.issues
        ?.map((issue) => [issue.path, issue.message].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");

      detail = [payload.error, issueText].filter(Boolean).join(" - ");
    } catch {
      detail = await response.text().catch(() => "");
    }

    throw new Error(
      ["PUSH_FAILED", response.status, detail].filter(Boolean).join(" "),
    );
  }

  return (await response.json()) as SyncPushResult;
}
