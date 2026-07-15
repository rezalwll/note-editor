import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { observeRequest } from "@/lib/request-observability";

const metadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const eventSchema = z.object({
  kind: z.enum(["error", "metric"]),
  name: z.string().min(1).max(160),
  value: z.number().finite().optional(),
  message: z.string().max(2_000).optional(),
  stack: z.string().max(12_000).optional(),
  source: z.string().min(1).max(160),
  route: z.string().max(500).optional(),
  metadata: z.record(z.string(), metadataValueSchema).optional(),
  occurredAt: z.iso.datetime(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(25),
});

export async function POST(request: Request) {
  const observation = observeRequest(request, "/api/observability/client");
  const user = await requireUser();
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return observation.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return observation.json({ error: "Invalid observability payload." }, { status: 400 });
  }

  let errorCount = 0;
  let metricCount = 0;
  for (const event of parsed.data.events) {
    const context = {
      userId: user.id,
      source: event.source,
      clientRoute: event.route,
      occurredAt: event.occurredAt,
      clientMetadata: event.metadata,
    };

    if (event.kind === "error") {
      errorCount += 1;
      observation.log.error("Client error reported", {
        ...context,
        error: {
          name: event.name,
          message: event.message,
          stack: event.stack,
        },
      });
    } else {
      metricCount += 1;
      observation.log.metric(event.name, event.value ?? 1, context);
    }
  }

  return observation.json(
    { accepted: parsed.data.events.length },
    { status: 202 },
    { errorCount, metricCount },
  );
}
