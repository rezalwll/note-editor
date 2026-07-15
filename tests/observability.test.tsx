import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClientErrorReporter } from "@/components/client-error-reporter";
import {
  reportClientError,
  reportClientMetric,
} from "@/lib/client-observability";
import { logger } from "@/lib/logger";
import {
  createRequestIds,
  observeRequest,
} from "@/lib/request-observability";

describe("structured observability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("serializes errors and circular context as valid JSON", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    logger.error("Observed failure", {
      error: new Error("boom"),
      circular,
    });

    const payload = JSON.parse(String(consoleError.mock.calls[0][0]));
    expect(payload).toMatchObject({
      level: "error",
      message: "Observed failure",
      error: { name: "Error", message: "boom" },
      circular: { self: "[Circular]" },
    });
  });

  it("preserves safe correlation IDs and adds them to the response", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = new Request("https://notava.test/api/example", {
      headers: {
        "x-request-id": "request-123",
        "x-correlation-id": "flow-456",
      },
    });
    expect(createRequestIds(request)).toEqual({
      requestId: "request-123",
      correlationId: "flow-456",
    });

    const observation = observeRequest(request, "/api/example");
    const response = observation.json({ ok: true }, { status: 201 });

    expect(response.headers.get("x-request-id")).toBe("request-123");
    expect(response.headers.get("x-correlation-id")).toBe("flow-456");
  });

  it("batches client errors and metrics before reporting them", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
    render(<ClientErrorReporter />);

    act(() => {
      reportClientError(new Error("editor crashed"), {
        source: "test.editor",
        route: "/pages/1",
      });
      reportClientMetric("autosave.failures", 1, {
        source: "test.autosave",
      });
      vi.advanceTimersByTime(1_000);
    });
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    expect(payload.events).toEqual([
      expect.objectContaining({
        kind: "error",
        name: "Error",
        message: "editor crashed",
      }),
      expect.objectContaining({
        kind: "metric",
        name: "autosave.failures",
        value: 1,
      }),
    ]);
  });
});
