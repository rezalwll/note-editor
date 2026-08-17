import { describe, expect, it } from "vitest";

import {
  appendPatternPoint,
  getIntermediatePatternPoint,
  getSafeAppLockReturnPath,
  maskEmail,
  normalizePattern,
  normalizeVerificationCode,
} from "@/lib/pattern-lock";

describe("pattern lock helpers", () => {
  it("accepts only distinct patterns with at least four valid points", () => {
    expect(normalizePattern([0, 1, 2, 5])).toBe("0-1-2-5");
    expect(normalizePattern([0, 1, 2])).toBeNull();
    expect(normalizePattern([0, 1, 1, 2])).toBeNull();
    expect(normalizePattern([0, 1, 2, 9])).toBeNull();
    expect(normalizePattern("0-1-2-5")).toBeNull();
  });

  it("adds intermediate points for straight skipped paths", () => {
    expect(getIntermediatePatternPoint(0, 2)).toBe(1);
    expect(getIntermediatePatternPoint(0, 8)).toBe(4);
    expect(getIntermediatePatternPoint(0, 5)).toBeNull();
    expect(appendPatternPoint([0], 2)).toEqual([0, 1, 2]);
    expect(appendPatternPoint([0, 1], 2)).toEqual([0, 1, 2]);
    expect(appendPatternPoint([0, 1], 1)).toEqual([0, 1]);
  });

  it("normalizes Persian and Arabic-Indic verification codes", () => {
    expect(normalizeVerificationCode("۱۲۳۴۵۶")).toBe("123456");
    expect(normalizeVerificationCode("١٢٣٤٥٦")).toBe("123456");
    expect(normalizeVerificationCode("123456")).toBe("123456");
    expect(normalizeVerificationCode("12345")).toBeNull();
    expect(normalizeVerificationCode(null)).toBeNull();
  });

  it("keeps return paths local and masks recovery email addresses", () => {
    expect(getSafeAppLockReturnPath("/pages/page-1?tab=a")).toBe(
      "/pages/page-1?tab=a",
    );
    expect(getSafeAppLockReturnPath("//evil.test")).toBe("/workspace");
    expect(getSafeAppLockReturnPath("/lock?returnTo=/")).toBe("/workspace");
    expect(maskEmail("owner@example.com")).toBe("ow•••@example.com");
    expect(maskEmail(null)).toBeNull();
  });
});
