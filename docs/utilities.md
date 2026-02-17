# Utilities

Helper functions for common patterns built on top of cache operations.

## Cache-Aside (Read-Through)

Methods on the `Cachyer` instance that implement the cache-aside pattern — check cache first, on miss fetch and store.

### getOrFetch

For string-based entries:

```typescript
const user = await cache.getOrFetch(
  `user:${userId}`,
  async () => {
    return await db.users.findById(userId);
  },
  3600, // TTL in seconds (optional, defaults to Cachyer's defaultTtl)
);
```

### getOrFetchHash

For hash-based entries:

```typescript
const profile = await cache.getOrFetchHash(
  `profile:${userId}`,
  async () => ({
    name: row.name,
    email: row.email,
    avatar: row.avatarUrl,
  }),
  1800,
);
```

## Cursor Pagination

Generic utilities for building cursor-based pagination.

### encodeCursor / decodeCursor

```typescript
import { encodeCursor, decodeCursor } from "cachyer";

const cursor = encodeCursor({ lastId: "post-99", lastScore: 42.5 });
// "eyJsYXN0SWQiOiJwb3N0LTk5IiwibGFzdFNjb3JlIjo0Mi41fQ"

const data = decodeCursor<{ lastId: string; lastScore: number }>(cursor);
// { lastId: "post-99", lastScore: 42.5 }
```

### buildCursorPage

Fetch `pageSize + 1` items, then build the page response:

```typescript
import { buildCursorPage } from "cachyer";

const items = await fetchPosts({ after: lastId, limit: 21 });

const page = buildCursorPage(items, 20, "id");
// { items: [...20 items], nextCursor: "..." | null, hasMore: true }
```

### parseCursorParams

Parse and validate incoming cursor parameters:

```typescript
import { parseCursorParams } from "cachyer";

const { offset, pageSize } = parseCursorParams(req.query.cursor, req.query.limit);
// offset: decoded cursor data or null (first page)
// pageSize: clamped between 1 and 100 (default: 20)
```

## Scoring & Time-Decay

Functions for trending feeds, leaderboards, and content ranking.

### calculateWeightedScore

```typescript
import { calculateWeightedScore } from "cachyer";

const score = calculateWeightedScore(
  { likes: 50, comments: 12, shares: 3, views: 1200 },
  { likes: 3, comments: 5, shares: 10, views: 0.1 },
);
// 150 + 60 + 30 + 120 = 360
```

### applyTimeDecay

```typescript
import { applyTimeDecay } from "cachyer";

const decayed = applyTimeDecay(360, 24, 0.1);
// 360 / (1 + 24 * 0.1) = 105.88
```

### calculateHotScore

Emphasizes very recent activity with aggressive decay:

```typescript
import { calculateHotScore } from "cachyer";

const score = calculateHotScore(
  { likes: 20, comments: 5, shares: 2, views: 500 },
  15, // minutes since last activity
);
```
