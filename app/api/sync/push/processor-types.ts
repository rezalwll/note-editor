import type { Prisma } from "@/generated/prisma/client";
import type {
  LocalNotebook,
  LocalPage,
  SyncPushResult,
  SyncTombstone,
} from "@/lib/offline-db/types";

import type { SyncQueueItem } from "./validation";
import { getIssueSummary } from "./utils";

export type PushProcessingContext = {
  userId: string;
  applied: SyncPushResult["applied"];
  conflicts: SyncPushResult["conflicts"];
  notebooks: Map<string, LocalNotebook>;
  pages: Map<string, LocalPage>;
  existingNotebooks: Map<string, Prisma.NotebookGetPayload<object>>;
  existingPages: Map<string, Prisma.PageGetPayload<object>>;
  validGroupIds: Set<string>;
  validNotebookIds: Set<string>;
  fallbackGroupId?: string;
  fallbackNotebookId?: string;
  existingTombstones: Map<string, SyncTombstone>;
  tombstones: Map<string, SyncTombstone>;
};

export type PushProcessingError = {
  message: string;
  status: number;
  item: SyncQueueItem;
  issues?: ReturnType<typeof getIssueSummary>;
};
