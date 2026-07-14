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
