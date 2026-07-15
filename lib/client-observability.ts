"use client";

export const CLIENT_OBSERVABILITY_EVENT = "notava-observability";

export type ClientObservabilityEvent = {
  kind: "error" | "metric";
  name: string;
  value?: number;
  message?: string;
  stack?: string;
  source: string;
  route?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
};

function dispatch(event: ClientObservabilityEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ClientObservabilityEvent>(CLIENT_OBSERVABILITY_EVENT, {
      detail: event,
    }),
  );
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "Unknown client error",
  };
}

export function reportClientError(
  error: unknown,
  context: {
    source: string;
    route?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const normalized = normalizeError(error);
  dispatch({
    kind: "error",
    name: normalized.name,
    message: normalized.message.slice(0, 2_000),
    stack: normalized.stack?.slice(0, 12_000),
    source: context.source,
    route: context.route,
    metadata: context.metadata,
    occurredAt: new Date().toISOString(),
  });
}

export function reportClientMetric(
  name: string,
  value: number,
  context: {
    source: string;
    route?: string;
    metadata?: Record<string, unknown>;
  },
) {
  dispatch({
    kind: "metric",
    name,
    value,
    source: context.source,
    route: context.route,
    metadata: context.metadata,
    occurredAt: new Date().toISOString(),
  });
}
