import type { FreeformBlock } from "@/lib/notes";

export class IncrementalBodyTextIndex {
  private order: string[] = [];
  private textById = new Map<string, string>();
  private cachedText = "";
  private dirty = false;

  constructor(blocks: readonly FreeformBlock[]) {
    this.replaceAll(blocks);
  }

  replaceAll(blocks: readonly FreeformBlock[]) {
    this.order = blocks.map((block) => block.id);
    this.textById = new Map(
      blocks.map((block) => [block.id, block.text.trim()]),
    );
    this.dirty = true;
  }

  upsert(block: Pick<FreeformBlock, "id" | "text">) {
    if (!this.textById.has(block.id)) {
      this.order.push(block.id);
    }
    const nextText = block.text.trim();
    if (this.textById.get(block.id) !== nextText) {
      this.textById.set(block.id, nextText);
      this.dirty = true;
    }
  }

  remove(ids: readonly string[]) {
    const removedIds = new Set(ids);
    if (![...removedIds].some((id) => this.textById.has(id))) {
      return;
    }

    this.order = this.order.filter((id) => !removedIds.has(id));
    for (const id of removedIds) {
      this.textById.delete(id);
    }
    this.dirty = true;
  }

  getText() {
    if (!this.dirty) {
      return this.cachedText;
    }

    this.cachedText = this.order
      .map((id) => this.textById.get(id) ?? "")
      .filter(Boolean)
      .join(" ");
    this.dirty = false;
    return this.cachedText;
  }
}
