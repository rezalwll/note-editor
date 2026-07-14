import { describe, expect, it } from "vitest";

import { detectUploadMimeType, inspectUpload } from "@/lib/upload-validation";

describe("upload validation", () => {
  it.each([
    [[0x25, 0x50, 0x44, 0x46, 0x2d], "application/pdf"],
    [[0xff, 0xd8, 0xff, 0x00], "image/jpeg"],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
  ])("detects file signatures", (signature, expected) => {
    expect(detectUploadMimeType(new Uint8Array(signature as number[]))).toBe(expected);
  });

  it("rejects a spoofed browser MIME type", async () => {
    const file = new File(["<script>alert(1)</script>"], "fake.png", {
      type: "image/png",
    });

    await expect(inspectUpload(file)).resolves.toBeNull();
  });
});
