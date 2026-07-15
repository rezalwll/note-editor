export type FixedVirtualRange = {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
};

type FixedVirtualRangeOptions = {
  itemCount: number;
  itemHeight: number;
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
};

export function getFixedVirtualRange({
  itemCount,
  itemHeight,
  scrollTop,
  viewportHeight,
  overscan = 4,
}: FixedVirtualRangeOptions): FixedVirtualRange {
  const safeItemCount = Math.max(0, Math.floor(itemCount));
  const safeItemHeight = Math.max(1, itemHeight);
  const safeScrollTop = Math.max(0, scrollTop);
  const safeViewportHeight = Math.max(safeItemHeight, viewportHeight);
  const startIndex = Math.max(
    0,
    Math.floor(safeScrollTop / safeItemHeight) - overscan,
  );
  const visibleItemCount = Math.ceil(safeViewportHeight / safeItemHeight);
  const endIndex = Math.min(
    safeItemCount,
    startIndex + visibleItemCount + overscan * 2,
  );

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * safeItemHeight,
    totalHeight: safeItemCount * safeItemHeight,
  };
}

type SpatialViewport = {
  top: number;
  bottom: number;
  overscan?: number;
};

type SpatialBounds = { top: number; height: number };

type SpatialEntry<T> = SpatialBounds & {
  key: string;
  item: T;
};

export class SpatialItemIndex<T> {
  private entries: SpatialEntry<T>[] = [];
  private entriesByKey = new Map<string, SpatialEntry<T>>();
  private maxHeight = 1;

  constructor(
    items: readonly T[],
    private readonly getKey: (item: T) => string,
    private readonly getBounds: (item: T) => SpatialBounds,
  ) {
    this.replaceAll(items);
  }

  get size() {
    return this.entries.length;
  }

  replaceAll(
    items: readonly T[],
    getBounds: (item: T) => SpatialBounds = this.getBounds,
  ) {
    this.entries = items.map((item) => this.createEntry(item, getBounds));
    this.entries.sort(compareSpatialEntries);
    this.entriesByKey = new Map(
      this.entries.map((entry) => [entry.key, entry]),
    );
    this.maxHeight = this.entries.reduce(
      (maximum, entry) => Math.max(maximum, entry.height),
      1,
    );
  }

  upsert(item: T, explicitBounds?: SpatialBounds) {
    const key = this.getKey(item);
    const existing = this.entriesByKey.get(key);
    const bounds = explicitBounds ?? this.getBounds(item);
    const nextTop = Math.max(0, bounds.top);
    const nextHeight = Math.max(1, bounds.height);

    if (existing && existing.top === nextTop) {
      existing.item = item;
      existing.height = nextHeight;
      this.maxHeight = Math.max(this.maxHeight, nextHeight);
      return;
    }

    if (existing) {
      const currentIndex = this.entries.indexOf(existing);
      if (currentIndex >= 0) {
        this.entries.splice(currentIndex, 1);
      }
    }

    const entry = { key, item, top: nextTop, height: nextHeight };
    const insertionIndex = lowerBoundEntry(this.entries, entry);
    this.entries.splice(insertionIndex, 0, entry);
    this.entriesByKey.set(key, entry);
    this.maxHeight = Math.max(this.maxHeight, nextHeight);
  }

  remove(keys: readonly string[]) {
    if (keys.length === 0) {
      return;
    }

    const removedKeys = new Set(keys);
    this.entries = this.entries.filter((entry) => !removedKeys.has(entry.key));
    for (const key of removedKeys) {
      this.entriesByKey.delete(key);
    }
  }

  query(viewport: SpatialViewport, alwaysIncludeKey?: string | null) {
    const overscan = Math.max(0, viewport.overscan ?? 0);
    const visibleTop = Math.max(0, viewport.top - overscan);
    const visibleBottom = Math.max(visibleTop, viewport.bottom + overscan);
    const searchTop = Math.max(0, visibleTop - this.maxHeight);
    const startIndex = lowerBoundTop(this.entries, searchTop);
    const visible: T[] = [];
    let alwaysIncluded = false;

    for (let index = startIndex; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      if (entry.top > visibleBottom) {
        break;
      }
      if (entry.top + entry.height >= visibleTop) {
        visible.push(entry.item);
        alwaysIncluded ||= entry.key === alwaysIncludeKey;
      }
    }

    if (alwaysIncludeKey && !alwaysIncluded) {
      const activeEntry = this.entriesByKey.get(alwaysIncludeKey);
      if (activeEntry) {
        visible.push(activeEntry.item);
      }
    }
    return visible;
  }

  private createEntry(
    item: T,
    getBounds: (item: T) => SpatialBounds = this.getBounds,
  ): SpatialEntry<T> {
    const bounds = getBounds(item);
    return {
      key: this.getKey(item),
      item,
      top: Math.max(0, bounds.top),
      height: Math.max(1, bounds.height),
    };
  }
}

function compareSpatialEntries<T>(
  left: SpatialEntry<T>,
  right: SpatialEntry<T>,
) {
  return left.top - right.top || left.key.localeCompare(right.key);
}

function lowerBoundEntry<T>(entries: SpatialEntry<T>[], target: SpatialEntry<T>) {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareSpatialEntries(entries[middle], target) < 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function lowerBoundTop<T>(entries: SpatialEntry<T>[], targetTop: number) {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].top < targetTop) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export function getVisibleSpatialItems<T>(
  items: readonly T[],
  viewport: SpatialViewport,
  getBounds: (item: T) => { top: number; height: number },
  shouldAlwaysInclude?: (item: T) => boolean,
) {
  const overscan = Math.max(0, viewport.overscan ?? 0);
  const visibleTop = Math.max(0, viewport.top - overscan);
  const visibleBottom = Math.max(visibleTop, viewport.bottom + overscan);

  return items.filter((item) => {
    if (shouldAlwaysInclude?.(item)) {
      return true;
    }

    const bounds = getBounds(item);
    const itemTop = Math.max(0, bounds.top);
    const itemBottom = itemTop + Math.max(1, bounds.height);
    return itemBottom >= visibleTop && itemTop <= visibleBottom;
  });
}
