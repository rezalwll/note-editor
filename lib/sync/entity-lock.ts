import type { Prisma } from "@/generated/prisma/client";

export type SyncEntityIdentity = {
  entityType: "notebook" | "page";
  entityId: string;
};

function lockKey(userId: string, identity: SyncEntityIdentity) {
  // Entity ids are global primary keys.  The lock must therefore be global as
  // well: including userId would let two users race a create for the same id
  // under two different advisory locks.
  void userId;
  return JSON.stringify([identity.entityType, identity.entityId]);
}

function compareIdentities(
  left: SyncEntityIdentity,
  right: SyncEntityIdentity,
) {
  const typeOrder = { notebook: 0, page: 1 } as const;
  return (
    typeOrder[left.entityType] - typeOrder[right.entityType] ||
    (left.entityId < right.entityId
      ? -1
      : left.entityId > right.entityId
        ? 1
        : 0)
  );
}

export async function acquireSyncEntityLocks(
  transaction: Prisma.TransactionClient,
  userId: string,
  identities: SyncEntityIdentity[],
) {
  // Notebook locks are the hierarchy locks for all of their child pages.  A
  // page mutation must include its old and new notebook identities here.  In
  // return, notebook-wide operations can safely mutate thousands of children
  // while taking only the notebook lock, rather than one advisory lock round
  // trip per page.  The explicit order also keeps cross-notebook moves free of
  // lock-order inversions.
  const uniqueIdentities = new Map(
    identities.map((identity) => [lockKey(userId, identity), identity]),
  );
  const keys = [...uniqueIdentities.values()]
    .sort(compareIdentities)
    .map((identity) => lockKey(userId, identity));

  for (const key of keys) {
    await transaction.$queryRaw<Array<{ acquired: number }>>`
      SELECT 1 AS acquired
      FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))
    `;
  }
}
