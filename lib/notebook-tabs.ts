type MeasuredNotebookRow = {
  id: string;
  rowTop: number;
};

export function getOverflowNotebookIds(
  rows: MeasuredNotebookRow[],
  pinnedNotebookId?: string | null,
) {
  if (rows.length === 0) {
    return [];
  }

  const visibleIds: string[] = [];
  const overflowIds: string[] = [];
  const seenRows: number[] = [];

  for (const row of rows) {
    if (!seenRows.includes(row.rowTop)) {
      seenRows.push(row.rowTop);
    }

    if (seenRows.length <= 2) {
      visibleIds.push(row.id);
    } else {
      overflowIds.push(row.id);
    }
  }

  if (overflowIds.length > 0 && visibleIds.length > 0) {
    overflowIds.unshift(visibleIds.pop()!);
  }

  if (!pinnedNotebookId || !overflowIds.includes(pinnedNotebookId)) {
    return overflowIds;
  }

  const pinnedIndex = overflowIds.indexOf(pinnedNotebookId);
  const swapCandidate = visibleIds.at(-1);

  if (!swapCandidate) {
    return overflowIds.filter((id) => id !== pinnedNotebookId);
  }

  overflowIds.splice(pinnedIndex, 1, swapCandidate);
  return overflowIds;
}
