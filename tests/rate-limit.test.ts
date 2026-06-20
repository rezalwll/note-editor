import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAttempts,
  getRateLimitState,
  recordFailedAttempt,
} from "@/lib/rate-limit";

describe("login rate limit", () => {
  const key = "test-client";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    clearAttempts(key);
  });

  afterEach(() => {
    clearAttempts(key);
    vi.useRealTimers();
  });

  it("blocks after five failed attempts in the same window", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordFailedAttempt(key);
    }

    const state = getRateLimitState(key);
    expect(state.blocked).toBe(true);
    expect(state.retryAfterMs).toBe(15 * 60 * 1000);
  });

  it("resets attempts after the window expires", () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      recordFailedAttempt(key);
    }

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    recordFailedAttempt(key);

    expect(getRateLimitState(key).blocked).toBe(false);
  });

  it("clears failures after a successful login", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordFailedAttempt(key);
    }

    clearAttempts(key);

    expect(getRateLimitState(key)).toEqual({
      blocked: false,
      retryAfterMs: 0,
    });
  });
});
