"use client";

import { useEffect, useRef } from "react";

import {
  CLIENT_OBSERVABILITY_EVENT,
  reportClientError,
  type ClientObservabilityEvent,
} from "@/lib/client-observability";

const FLUSH_DELAY_MS = 1_000;
const MAX_BATCH_SIZE = 25;

function isExpectedNavigationError(error: unknown) {
  const message =
    error instanceof Error
      ? `${error.message}\n${error.stack ?? ""}`
      : String(error ?? "");
  return message.includes("NEXT_REDIRECT");
}

function clientCorrelationId() {
  const storageKey = "notava-correlation-id";
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function ClientErrorReporter() {
  const queueRef = useRef<ClientObservabilityEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correlationIdRef = useRef<string>("");

  useEffect(() => {
    correlationIdRef.current = clientCorrelationId();

    const send = (events: ClientObservabilityEvent[], beacon = false) => {
      if (events.length === 0) return;
      const body = JSON.stringify({ events });

      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/observability/client",
          new Blob([body], { type: "application/json" }),
        );
        return;
      }

      void fetch("/api/observability/client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": correlationIdRef.current,
        },
        body,
        keepalive: true,
      }).catch(() => undefined);
    };

    const flush = (beacon = false) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const events = queueRef.current.splice(0, MAX_BATCH_SIZE);
      send(events, beacon);
      if (queueRef.current.length > 0 && !beacon) {
        timerRef.current = setTimeout(() => flush(), FLUSH_DELAY_MS);
      }
    };

    const enqueue = (event: ClientObservabilityEvent) => {
      queueRef.current.push(event);
      if (queueRef.current.length >= MAX_BATCH_SIZE) {
        flush();
      } else if (!timerRef.current) {
        timerRef.current = setTimeout(() => flush(), FLUSH_DELAY_MS);
      }
    };

    const handleObservability = (event: Event) => {
      enqueue((event as CustomEvent<ClientObservabilityEvent>).detail);
    };
    const handleWindowError = (event: ErrorEvent) => {
      if (isExpectedNavigationError(event.error ?? event.message)) {
        return;
      }
      reportClientError(event.error ?? event.message, {
        source: "window.error",
        route: window.location.pathname,
        metadata: {
          filename: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isExpectedNavigationError(event.reason)) {
        return;
      }
      reportClientError(event.reason, {
        source: "window.unhandledrejection",
        route: window.location.pathname,
      });
    };
    const handlePageHide = () => flush(true);

    window.addEventListener(CLIENT_OBSERVABILITY_EVENT, handleObservability);
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener(CLIENT_OBSERVABILITY_EVENT, handleObservability);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("pagehide", handlePageHide);
      flush(true);
    };
  }, []);

  return null;
}
