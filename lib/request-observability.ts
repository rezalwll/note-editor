import { NextResponse } from "next/server";

import { logger, type LogContext } from "@/lib/logger";

const REQUEST_ID_HEADER = "x-request-id";
const CORRELATION_ID_HEADER = "x-correlation-id";
const SAFE_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

function readSafeId(request: Request, header: string) {
  const value = request.headers.get(header)?.trim();
  return value && SAFE_ID_PATTERN.test(value) ? value : null;
}

export function createRequestIds(request: Request) {
  const requestId = readSafeId(request, REQUEST_ID_HEADER) ?? crypto.randomUUID();
  const correlationId =
    readSafeId(request, CORRELATION_ID_HEADER) ?? requestId;

  return { requestId, correlationId };
}

export function observeRequest(request: Request, route: string) {
  const startedAt = performance.now();
  const ids = createRequestIds(request);
  const requestLogger = logger.child({
    ...ids,
    route,
    method: request.method,
  });

  requestLogger.info("Request started");

  function complete<T extends Response>(response: T, context?: LogContext): T {
    const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100;
    response.headers.set(REQUEST_ID_HEADER, ids.requestId);
    response.headers.set(CORRELATION_ID_HEADER, ids.correlationId);
    requestLogger.info("Request completed", {
      ...context,
      status: response.status,
      latencyMs,
    });
    requestLogger.metric("http.request.duration", latencyMs, {
      status: response.status,
      unit: "ms",
    });
    return response;
  }

  function json(
    body: unknown,
    init?: ResponseInit,
    context?: LogContext,
  ) {
    return complete(NextResponse.json(body, init), context);
  }

  function failure(
    error: unknown,
    context?: LogContext,
    status = 500,
  ) {
    requestLogger.error("Request failed", {
      ...context,
      error,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    return json(
      { error: "An unexpected server error occurred." },
      { status },
      context,
    );
  }

  return { ...ids, log: requestLogger, complete, json, failure };
}
