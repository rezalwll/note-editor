import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  MAX_WORKSPACE_ARCHIVE_BYTES,
  parseWorkspaceArchive,
} from "@/lib/workspace-transfer";

describe("workspace archive validation", () => {
  it("parses a bounded archive with valid relationships", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({
      formatVersion: 1,
      exportedAt: "2026-07-14T12:00:00.000Z",
      app: "notebook",
      user: { username: "owner", displayName: "Owner" },
    }));
    zip.file("workspace.json", JSON.stringify({
      groups: [], notebooks: [], pages: [], attachments: [],
    }));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const result = await parseWorkspaceArchive(bytes);
    expect(result.workspace.pages).toEqual([]);
  });

  it("rejects an oversized compressed input before parsing", async () => {
    const bytes = new Uint8Array(MAX_WORKSPACE_ARCHIVE_BYTES + 1);
    await expect(parseWorkspaceArchive(bytes)).rejects.toThrow("بیشتر از حد مجاز");
  });
});
