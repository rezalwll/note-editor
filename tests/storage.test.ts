import { describe, expect, it } from "vitest";

import { isValidStorageKey } from "@/lib/storage-key";

describe("storage keys", () => {
  it("accepts generated upload keys", () => {
    expect(isValidStorageKey("1712345678-report-file.pdf")).toBe(true);
  });

  it.each([
    "../secret.env",
    "folder/file.pdf",
    "folder\\file.pdf",
    "",
    "name with spaces.pdf",
  ])("rejects unsafe storage key %s", (storageKey) => {
    expect(isValidStorageKey(storageKey)).toBe(false);
  });
});
