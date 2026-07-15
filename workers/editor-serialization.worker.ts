/// <reference lib="webworker" />

import { serializeEditorContentSync } from "@/lib/editor-serialization-core";
import type { FreeformBlock } from "@/lib/notes";

type SerializeRequest = {
  id: number;
  blocks: FreeformBlock[];
  bodyText: string;
};

self.addEventListener("message", (event: MessageEvent<SerializeRequest>) => {
  const { id, blocks, bodyText } = event.data;
  self.postMessage({
    id,
    result: serializeEditorContentSync(blocks, bodyText),
  });
});

export {};
