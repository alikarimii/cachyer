// =============================================
// CACHYER - CURSOR PAGINATION UTILITIES
// =============================================

/**
 * Encode cursor data to a Base64 string
 */
export function encodeCursor(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

/**
 * Decode a Base64 cursor string back to data
 */
export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string,
): T | null {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf-8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Cursor page result
 */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Build a cursor-based page from a list of items
 */
export function buildCursorPage<T extends Record<string, unknown>>(
  items: T[],
  pageSize: number,
  cursorField: keyof T,
): CursorPage<T> {
  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;

  const nextCursor =
    hasMore && pageItems.length > 0
      ? encodeCursor({
          after: pageItems[pageItems.length - 1]![cursorField],
        })
      : null;

  return { items: pageItems, nextCursor, hasMore };
}

/**
 * Parse and validate cursor parameters
 */
export function parseCursorParams(
  cursor?: string | null,
  limit?: number,
): { offset: Record<string, unknown> | null; pageSize: number } {
  const pageSize = Math.max(1, Math.min(limit ?? 20, 100));
  const offset = cursor ? decodeCursor(cursor) : null;
  return { offset, pageSize };
}
