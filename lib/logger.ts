export type LogContext = Record<string, unknown>;
type LogLevel = "info" | "warn" | "error";

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
};

function serializeError(error: Error, seen: WeakSet<object>): SerializedError {
  if (seen.has(error)) {
    return { name: error.name, message: "[Circular error]" };
  }
  seen.add(error);
  const serialized: SerializedError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: normalizeValue(error.cause, seen),
  };
  seen.delete(error);
  return serialized;
}

function normalizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Error) {
    return serializeError(value, seen);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  let normalized: unknown;
  if (Array.isArray(value)) {
    normalized = value.map((item) => normalizeValue(item, seen));
  } else {
    normalized = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeValue(item, seen)]),
    );
  }
  seen.delete(value);
  return normalized;
}

function write(
  level: LogLevel,
  message: string,
  context: LogContext = {},
) {
  const normalized = normalizeValue(context, new WeakSet()) as LogContext;
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...normalized,
  });

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

function createLogger(baseContext: LogContext = {}) {
  return {
    info: (message: string, context?: LogContext) =>
      write("info", message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      write("warn", message, { ...baseContext, ...context }),
    error: (message: string, context?: LogContext) =>
      write("error", message, { ...baseContext, ...context }),
    metric: (
      name: string,
      value = 1,
      context?: LogContext & { unit?: string },
    ) => write("info", "Metric recorded", {
      ...baseContext,
      ...context,
      eventType: "metric",
      metricName: name,
      metricValue: value,
    }),
    child: (context: LogContext) => createLogger({ ...baseContext, ...context }),
  };
}

export type Logger = ReturnType<typeof createLogger>;
export const logger = createLogger();
