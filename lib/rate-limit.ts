type AttemptState = {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number;
};

const attempts = new Map<string, AttemptState>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [key, value] of attempts.entries()) {
    const blockExpired = value.blockedUntil > 0 && value.blockedUntil <= now;
    const windowExpired = value.firstAttemptAt + WINDOW_MS <= now;

    if (blockExpired || (value.blockedUntil === 0 && windowExpired)) {
      attempts.delete(key);
    }
  }
}

export function getRateLimitState(key: string) {
  cleanup();
  const state = attempts.get(key);

  if (!state) {
    return { blocked: false, retryAfterMs: 0 };
  }

  if (state.blockedUntil > Date.now()) {
    return { blocked: true, retryAfterMs: state.blockedUntil - Date.now() };
  }

  return { blocked: false, retryAfterMs: 0 };
}

export function recordFailedAttempt(key: string) {
  cleanup();
  const current = attempts.get(key);
  const now = Date.now();

  if (!current) {
    attempts.set(key, { count: 1, firstAttemptAt: now, blockedUntil: 0 });
    return;
  }

  const nextCount = current.count + 1;

  attempts.set(key, {
    count: nextCount,
    firstAttemptAt: current.firstAttemptAt,
    blockedUntil: nextCount >= MAX_ATTEMPTS ? now + BLOCK_MS : 0,
  });
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}
