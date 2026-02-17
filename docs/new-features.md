# Cachyer — New Features Guide

This document covers the new features added to Cachyer's core package. Each section explains what was added, why it's useful, and how to use it.

---

## Table of Contents

1. [Distributed Lock Service](#1-distributed-lock-service)
2. [Advanced Rate Limiting Scripts](#2-advanced-rate-limiting-scripts)
3. [Cache-Aside Helpers](#3-cache-aside-helpers)
4. [Cursor Pagination Utilities](#4-cursor-pagination-utilities)
5. [Scoring & Time-Decay Utilities](#5-scoring--time-decay-utilities)
6. [HyperLogLog Schema Templates](#6-hyperloglog-schema-templates)
7. [Bloom Filter Schema Templates](#7-bloom-filter-schema-templates)

---

## 1. Distributed Lock Service

**File:** `src/services/lock.service.ts`

A Redis-backed distributed locking mechanism using the SET NX PX pattern with Lua scripts for safe release and extension.

### When to use

- Preventing concurrent feed generation for the same user
- Ensuring only one worker processes a job at a time
- Coordinating access to shared resources across multiple instances

### API

```typescript
import { createLockService, LockService } from 'cachyer'

const lockService = createLockService(adapter, {
  keyPrefix: 'lock',        // default: 'lock'
  defaultTtlMs: 10000,      // default: 10s
  defaultTimeoutMs: 5000,   // default: 5s (acquire timeout)
  defaultRetryIntervalMs: 100, // default: 100ms
})
```

### acquireLock

Attempts to acquire a lock on a resource. Returns immediately.

```typescript
const result = await lockService.acquireLock('order:123')

if (result.acquired) {
  // Lock acquired — do work
  // result.ownerId contains the lock owner identifier
  await lockService.releaseLock('order:123', result.ownerId)
}
```

### releaseLock

Safely releases a lock. Uses a Lua script to ensure only the lock owner can release it — prevents accidentally releasing someone else's lock.

```typescript
const released = await lockService.releaseLock('order:123', ownerId)
// true if released, false if lock was owned by someone else
```

### extendLock

Extends the TTL of a lock you own. Useful for long-running operations that may exceed the original TTL.

```typescript
const extended = await lockService.extendLock('order:123', 15000, ownerId)
// true if extended, false if lock expired or owned by someone else
```

### withLock

The recommended way to use locks. Automatically acquires, executes your function, and releases — even if the function throws.

```typescript
const result = await lockService.withLock(
  'feed-generation:user-42',
  async () => {
    // This code runs while holding the lock
    const feed = await generateFeed(userId)
    return feed
  },
  {
    ttlMs: 30000,          // lock TTL
    timeoutMs: 10000,      // how long to wait for acquisition
    retryIntervalMs: 200,  // retry interval while waiting
  },
)
```

If the lock cannot be acquired within the timeout, `withLock` throws an error.

---

## 2. Advanced Rate Limiting Scripts

**File:** `src/services/rate-limit-scripts.ts`

Four additional rate limiting strategies implemented as atomic Lua scripts. These complement the existing fixed-window and sliding-window strategies already in `RateLimitService`.

### Bug fix: Race condition in checkBasic

The `checkBasic()` method in `RateLimitService` previously used a GET→INCR pattern that was susceptible to race conditions under concurrent requests. It now uses an atomic INCR→compare pattern: increment first, then check against the limit. This is safe without Lua scripts.

### Token Bucket

Allows bursts up to a maximum while refilling tokens at a steady rate.

```typescript
import {
  tokenBucketRateLimitScript,
  buildTokenBucketParams,
} from 'cachyer'

// 100 tokens max, refills at 10 tokens/second
const params = buildTokenBucketParams(
  'ratelimit:api:user-42',
  100,   // bucket size
  10,    // refill rate (tokens per second)
  1,     // tokens consumed per request (default: 1)
)

const result = await adapter.executeScript(
  tokenBucketRateLimitScript,
  params.keys,
  params.args,
)
// result: { allowed: boolean, tokens: number, resetAt: number }
```

**Use when:** You want to allow short bursts (e.g., batch API calls) while enforcing a sustained average rate.

### Multi-Tier Rate Limiting

Check multiple rate limits atomically. All tiers must pass for the request to be allowed.

```typescript
import { multiTierRateLimitScript, buildMultiTierParams } from 'cachyer'

const params = buildMultiTierParams('user-42', [
  { name: 'per-second', maxRequests: 10, windowSeconds: 1 },
  { name: 'per-minute', maxRequests: 100, windowSeconds: 60 },
  { name: 'per-hour', maxRequests: 1000, windowSeconds: 3600 },
])

const result = await adapter.executeScript(
  multiTierRateLimitScript,
  params.keys,
  params.args,
)
// result: { allowed: boolean, limits: Array<{ tier, count, max, ttl, allowed }> }
```

**Use when:** You need layered limits — e.g., "10 per second AND 100 per minute AND 1000 per hour".

### Quota-Based Rate Limiting

Daily or monthly quotas that reset at specific times.

```typescript
import {
  quotaRateLimitScript,
  buildQuotaParams,
  getNextDailyReset,
  getNextMonthlyReset,
} from 'cachyer'

// 1000 API calls per day, resets at midnight UTC
const params = buildQuotaParams(
  'quota:api:user-42',
  1000,                // total quota
  getNextDailyReset(), // when quota resets
  1,                   // cost per request (default: 1)
)

const result = await adapter.executeScript(
  quotaRateLimitScript,
  params.keys,
  params.args,
)
// result: { allowed, used, quota, remaining, resetAt }
```

**Use when:** You have subscription-based plans with daily/monthly usage limits.

### Enhanced Sliding Window

An improved sliding window using sorted sets, also available as a standalone script.

```typescript
import { enhancedSlidingWindowScript, buildSlidingWindowParams } from 'cachyer'

const params = buildSlidingWindowParams(
  'ratelimit:sliding:user-42',
  100,    // max requests
  60000,  // window in milliseconds
)

const result = await adapter.executeScript(
  enhancedSlidingWindowScript,
  params.keys,
  params.args,
)
// result: { allowed, count, resetAt }
```

### Convenience object

All scripts are also available under a single `RateLimitScripts` object:

```typescript
import { RateLimitScripts } from 'cachyer'

RateLimitScripts.tokenBucket
RateLimitScripts.slidingWindow
RateLimitScripts.multiTier
RateLimitScripts.quota
```

---

## 3. Cache-Aside Helpers

**File:** `src/core/cachyer.ts` (added to the `Cachyer` class)

Two convenience methods that implement the cache-aside (read-through) pattern directly on the Cachyer instance.

### getOrFetch

For string-based cache entries. Checks the cache first; on miss, calls your fetch function, caches the result, and returns it.

```typescript
const user = await cache.getOrFetch(
  `user:${userId}`,
  async () => {
    // This only runs on cache miss
    return await db.users.findById(userId)
  },
  3600, // TTL in seconds (optional, defaults to Cachyer's defaultTtl)
)
```

Values are serialized/deserialized using the Cachyer's configured serializer (JSON by default).

### getOrFetchHash

Same pattern but for hash-based cache entries. Useful when your cached data is a flat object.

```typescript
const profile = await cache.getOrFetchHash(
  `profile:${userId}`,
  async () => {
    const row = await db.profiles.findById(userId)
    return {
      name: row.name,
      email: row.email,
      avatar: row.avatarUrl,
    }
  },
  1800,
)
```

**Use when:** You're repeatedly writing the "check cache → miss → fetch from DB → store in cache" pattern. These methods eliminate that boilerplate.

---

## 4. Cursor Pagination Utilities

**File:** `src/utils/cursor.ts`

Generic utilities for building cursor-based pagination, independent of any specific data source.

### encodeCursor / decodeCursor

Encode pagination state into an opaque Base64url string, decode it back.

```typescript
import { encodeCursor, decodeCursor } from 'cachyer'

const cursor = encodeCursor({ lastId: 'post-99', lastScore: 42.5 })
// "eyJsYXN0SWQiOiJwb3N0LTk5IiwibGFzdFNjb3JlIjo0Mi41fQ"

const data = decodeCursor<{ lastId: string; lastScore: number }>(cursor)
// { lastId: 'post-99', lastScore: 42.5 }
```

### buildCursorPage

Takes a list of items (fetch one extra to detect `hasMore`) and builds the page response.

```typescript
import { buildCursorPage } from 'cachyer'

// Fetch pageSize + 1 items from your data source
const items = await fetchPosts({ after: lastId, limit: 21 })

const page = buildCursorPage(items, 20, 'id')
// {
//   items: [...20 items],
//   nextCursor: "eyJhZnRlciI6InBvc3QtMjAifQ" | null,
//   hasMore: true | false,
// }
```

### parseCursorParams

Parse and validate incoming cursor parameters from an API request.

```typescript
import { parseCursorParams } from 'cachyer'

// In your API handler:
const { offset, pageSize } = parseCursorParams(req.query.cursor, req.query.limit)
// offset: decoded cursor data or null (first page)
// pageSize: clamped between 1 and 100 (default: 20)
```

**Use when:** Building paginated APIs on top of sorted sets, feeds, or any ordered data.

---

## 5. Scoring & Time-Decay Utilities

**File:** `src/utils/scoring.ts`

Generic scoring functions useful for trending feeds, leaderboards, and content ranking.

### calculateWeightedScore

Compute a weighted sum from named metrics.

```typescript
import { calculateWeightedScore } from 'cachyer'

const score = calculateWeightedScore(
  { likes: 50, comments: 12, shares: 3, views: 1200 },
  { likes: 3, comments: 5, shares: 10, views: 0.1 },
)
// 50*3 + 12*5 + 3*10 + 1200*0.1 = 150 + 60 + 30 + 120 = 360
```

### applyTimeDecay

Apply a simple inverse time decay to a score.

```typescript
import { applyTimeDecay } from 'cachyer'

const decayed = applyTimeDecay(360, 24, 0.1)
// 360 / (1 + 24 * 0.1) = 360 / 3.4 ≈ 105.88
```

- `hoursElapsed`: how old the content is
- `decayFactor`: higher = faster decay (default: 0.1)

### calculateHotScore

Calculate a "hot" score that emphasizes very recent activity with aggressive decay.

```typescript
import { calculateHotScore } from 'cachyer'

const score = calculateHotScore(
  { likes: 20, comments: 5, shares: 2, views: 500 },
  15, // minutes since last activity
)
```

**Use when:** Building trending/hot feeds, recommendation scores, or any ranking that should decay over time.

---

## 6. HyperLogLog Schema Templates

**File:** `src/schemas/schema-builder.ts`

Three new builder methods and a pre-built schema template for HyperLogLog operations.

### Builder methods

Available on `TypedOperationBuilder` when defining custom schemas:

```typescript
import { createTypedSchema } from 'cachyer'

const UniqueVisitorsSchema = createTypedSchema<{ pageId: string }>()
  .name('unique-visitors')
  .keyPattern('page:{pageId}:visitors')
  .structure('STRING')
  .ttl(86400)
  .operations((ops) =>
    ops
      .addHyperLogLogAdd()     // PFADD — add members
      .addHyperLogLogCount()   // PFCOUNT — approximate count
      .addHyperLogLogMerge()   // PFMERGE — merge multiple HLLs
      .addDelete()
      .addExpire(),
  )
  .build()
```

### createHyperLogLogSchema

A pre-built template for the common case:

```typescript
import { createHyperLogLogSchema } from 'cachyer'

const UniqueViewers = createHyperLogLogSchema<{ postId: string }>(
  'unique-viewers',
  'post:{postId}:viewers',
  86400,
)

// Includes: hyperLogLogAdd, hyperLogLogCount, delete, exists, expire, ttl
```

### Usage with Cachyer

```typescript
cache.registerSchema(UniqueViewers)

// Add a viewer
await cache.execute(UniqueViewers.operations.hyperLogLogAdd, {
  postId: 'post-1',
  members: ['user-42'],
})

// Get approximate unique count
const count = await cache.execute(UniqueViewers.operations.hyperLogLogCount, {
  postId: 'post-1',
})
```

**Use when:** You need approximate unique counting (unique visitors, unique viewers, unique IPs) — HyperLogLog uses minimal memory (~12KB per key) regardless of cardinality.

---

## 7. Bloom Filter Schema Templates

**File:** `src/schemas/schema-builder.ts`

Five new builder methods and a pre-built schema template for Bloom filter operations. Bloom filters are space-efficient probabilistic data structures that test whether an element is a member of a set — false positives are possible, but false negatives are not.

### Builder methods

Available on `TypedOperationBuilder` when defining custom schemas:

```typescript
import { createTypedSchema } from 'cachyer'

const SeenPostsSchema = createTypedSchema<{ userId: string }>()
  .name('seen-posts')
  .keyPattern('user:{userId}:seen')
  .structure('STRING')
  .ttl(86400)
  .operations((ops) =>
    ops
      .addBloomFilterAdd()        // BF.ADD — add single item
      .addBloomFilterMultiAdd()   // BF.MADD — add multiple items
      .addBloomFilterExists()     // BF.EXISTS — check single item
      .addBloomFilterMultiExists() // BF.MEXISTS — check multiple items
      .addBloomFilterReserve()    // BF.RESERVE — create with error rate & capacity
      .addDelete()
      .addExpire(),
  )
  .build()
```

### createBloomFilterSchema

A pre-built template for the common case:

```typescript
import { createBloomFilterSchema } from 'cachyer'

const SeenPosts = createBloomFilterSchema<{ userId: string }>(
  'seen-posts',
  'user:{userId}:seen',
  86400,
)

// Includes: bloomFilterAdd, bloomFilterMultiAdd, bloomFilterExists,
//           bloomFilterMultiExists, bloomFilterReserve, delete, exists, expire, ttl
```

### Usage with Cachyer

```typescript
cache.registerSchema(SeenPosts)

// Reserve a filter with 0.01 error rate and 10000 capacity
await cache.execute(SeenPosts.operations.bloomFilterReserve, {
  userId: 'user-42',
  errorRate: 0.01,
  capacity: 10000,
})

// Add a seen post
await cache.execute(SeenPosts.operations.bloomFilterAdd, {
  userId: 'user-42',
  item: 'post-123',
})

// Check if a post was seen
const seen = await cache.execute(SeenPosts.operations.bloomFilterExists, {
  userId: 'user-42',
  item: 'post-123',
})
// true

// Batch check multiple posts
const results = await cache.execute(SeenPosts.operations.bloomFilterMultiExists, {
  userId: 'user-42',
  items: ['post-123', 'post-456', 'post-789'],
})
// [true, false, false]
```

**Use when:** You need fast membership testing with minimal memory — deduplication (seen posts in feeds), spam detection, checking if a user has already performed an action. Bloom filters use far less memory than sets for large cardinalities.

---

## Import Summary

All new features are exported from the main `cachyer` package:

```typescript
// Lock Service
import { LockService, createLockService } from 'cachyer'

// Advanced Rate Limiting
import {
  tokenBucketRateLimitScript,
  multiTierRateLimitScript,
  quotaRateLimitScript,
  enhancedSlidingWindowScript,
  buildTokenBucketParams,
  buildMultiTierParams,
  buildQuotaParams,
  buildSlidingWindowParams,
  getNextDailyReset,
  getNextMonthlyReset,
  RateLimitScripts,
} from 'cachyer'

// Cache-Aside (methods on Cachyer instance)
// cache.getOrFetch(key, fetchFn, ttl?)
// cache.getOrFetchHash(key, fetchFn, ttl?)

// Cursor Pagination
import {
  encodeCursor,
  decodeCursor,
  buildCursorPage,
  parseCursorParams,
} from 'cachyer'

// Scoring
import {
  calculateWeightedScore,
  applyTimeDecay,
  calculateHotScore,
} from 'cachyer'

// HyperLogLog Schema
import { createHyperLogLogSchema } from 'cachyer'

// Bloom Filter Schema
import { createBloomFilterSchema } from 'cachyer'
```
