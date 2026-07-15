import { z } from "zod";

const optionalStringSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => value ?? undefined);

const optionalBooleanSchema = z
  .union([z.boolean(), z.null()])
  .optional()
  .transform((value) => value ?? undefined);

export const notebookPayloadSchema = z.object({
  id: optionalStringSchema,
  userId: z.string().optional(),
  groupId: z.string().nullable().optional(),
  name: optionalStringSchema,
  description: z.string().nullable().optional(),
  archived: optionalBooleanSchema,
  updatedAt: optionalStringSchema,
});

export const pagePayloadSchema = z.object({
  id: optionalStringSchema,
  userId: z.string().optional(),
  notebookId: optionalStringSchema,
  title: optionalStringSchema,
  bodyHtml: optionalStringSchema,
  bodyText: z.string().optional(),
  archived: optionalBooleanSchema,
  updatedAt: optionalStringSchema,
});

const queueIdSchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    const numericValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  });

const optionalDateStringSchema = z
  .union([z.string().datetime(), z.date(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) {
      return value;
    }

    return value instanceof Date ? value.toISOString() : value;
  });

export const queueSchema = z.object({
  id: queueIdSchema,
  userId: z.string().optional(),
  entityType: z.enum(["notebook", "page"]),
  entityId: z.string(),
  operation: z.enum(["upsert", "archive"]),
  baseUpdatedAt: optionalDateStringSchema,
  payload: z.unknown(),
  createdAt: optionalDateStringSchema.transform(
    (value) => value ?? new Date().toISOString(),
  ),
  status: z
    .enum(["pending", "failed", "synced", "conflict"])
    .optional()
    .catch("pending")
    .transform((status) => (status === "failed" ? "failed" : "pending")),
});

export const pushSchema = z.object({
  operations: z.array(queueSchema).min(1).max(100),
}).superRefine(({ operations }, context) => {
  const identities = new Set<string>();
  for (const [index, operation] of operations.entries()) {
    const identity = `${operation.entityType}:${operation.entityId}`;
    if (identities.has(identity)) {
      context.addIssue({
        code: "custom",
        message: "Duplicate entity operation in one sync batch.",
        path: ["operations", index, "entityId"],
      });
    }
    identities.add(identity);
  }
});

export type NotebookPayload = z.infer<typeof notebookPayloadSchema>;
export type PagePayload = z.infer<typeof pagePayloadSchema>;
export type SyncQueueItem = z.infer<typeof queueSchema>;
