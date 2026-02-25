# Cachyer API Reference

Complete API reference for AI coding assistants and developers integrating Cachyer.

## Table of Contents

1. [Factory Functions](#factory-functions)
2. [Core Cachyer Methods](#core-cachyer-methods)
3. [Schema Builder](#schema-builder)
4. [Schema Templates](#schema-templates)
5. [Key Patterns](#key-patterns)
6. [Services](#services)
7. [Actions (Workflows)](#actions-workflows)
8. [Types](#types)

---

## Factory Functions

### createRedisCachyer

Create a Redis-backed Cachyer instance.

```typescript
function createRedisCachyer(options?: {
  keyPrefix?: string; // Prefix for all keys (default: "")
  defaultTtl?: number; // Default TTL in seconds (default: 3600)
  connectionOptions?: {
    // ioredis connection options
    host?: string; // Redis host (default: "localhost")
    port?: number; // Redis port (default: 6379)
    password?: string; // Redis password
    db?: number; // Redis database number
    // ... see ioredis docs for full options
  };
}): Cachyer;
```

**Example:**

```typescript
const cache = createRedisCachyer({
  keyPrefix: "myapp",
  defaultTtl: 3600,
  connectionOptions: {
    host: "redis.example.com",
    port: 6379,
    password: "secret",
  },
});
```

### createMemoryCachyer

Create an in-memory Cachyer instance (for testing/development).

```typescript
function createMemoryCachyer(options?: {
  keyPrefix?: string; // Prefix for all keys
  defaultTtl?: number; // Default TTL in seconds
  maxEntries?: number; // Max entries before eviction (default: 10000)
}): Cachyer;
```

**Example:**

```typescript
const cache = createMemoryCachyer({ keyPrefix: "test", maxEntries: 1000 });
```

### createCachyer

Create a Cachyer instance with custom adapter.

```typescript
function createCachyer(config: {
  adapter: CacheAdapter; // Required adapter instance
  keyPrefix?: string;
  defaultTtl?: number;
  serializer?: Serializer;
  logger?: CacheLogger;
  defaultOptions?: ExecuteOptions;
  enableMetrics?: boolean;
  autoConnect?: boolean;
}): Cachyer;
```

---

## Core Cachyer Methods

### String Operations

```typescript
// Set a value
await cache.set(key: string, value: string, options?: {
  ex?: number;    // Expire in seconds
  px?: number;    // Expire in milliseconds
  nx?: boolean;   // Only set if not exists
  xx?: boolean;   // Only set if exists
}): Promise<"OK" | null>;

// Get a value
await cache.get(key: string): Promise<string | null>;

// Delete keys
await cache.del(...keys: string[]): Promise<number>;

// Check existence
await cache.exists(...keys: string[]): Promise<number>;

// Set expiration
await cache.expire(key: string, seconds: number): Promise<0 | 1>;

// Get TTL
await cache.ttl(key: string): Promise<number>;

// Increment
await cache.incr(key: string): Promise<number>;
await cache.incrby(key: string, increment: number): Promise<number>;
await cache.decr(key: string): Promise<number>;
await cache.decrby(key: string, decrement: number): Promise<number>;
```

### Hash Operations

```typescript
// Set field
await cache.hset(key: string, field: string, value: string): Promise<number>;

// Set multiple fields
await cache.hmset(key: string, fields: Record<string, string | number>): Promise<"OK">;

// Get field
await cache.hget(key: string, field: string): Promise<string | null>;

// Get multiple fields
await cache.hmget(key: string, fields: string[]): Promise<(string | null)[]>;

// Get all fields
await cache.hgetall(key: string): Promise<Record<string, string>>;

// Delete fields
await cache.hdel(key: string, ...fields: string[]): Promise<number>;

// Check field exists
await cache.hexists(key: string, field: string): Promise<0 | 1>;

// Increment field
await cache.hincrby(key: string, field: string, increment: number): Promise<number>;

// Get field count
await cache.hlen(key: string): Promise<number>;
```

### Sorted Set Operations

```typescript
// Add members
await cache.zadd(key: string, members: Array<{
  score: number;
  member: string;
}>): Promise<number>;

// Get range (low to high)
await cache.zrange(key: string, start: number, stop: number, options?: {
  withScores?: boolean;
}): Promise<string[] | Array<{ member: string; score: number }>>;

// Get range (high to low)
await cache.zrevrange(key: string, start: number, stop: number, options?: {
  withScores?: boolean;
}): Promise<string[] | Array<{ member: string; score: number }>>;

// Get range by score
await cache.zrangebyscore(key: string, min: number | string, max: number | string, options?: {
  withScores?: boolean;
  offset?: number;
  count?: number;
}): Promise<string[] | Array<{ member: string; score: number }>>;

// Remove members
await cache.zrem(key: string, ...members: string[]): Promise<number>;

// Get score
await cache.zscore(key: string, member: string): Promise<number | null>;

// Get rank (0-indexed position, low to high)
await cache.zrank(key: string, member: string): Promise<number | null>;

// Get reverse rank (high to low)
await cache.zrevrank(key: string, member: string): Promise<number | null>;

// Get count
await cache.zcard(key: string): Promise<number>;

// Count in score range
await cache.zcount(key: string, min: number | string, max: number | string): Promise<number>;

// Increment score
await cache.zincrby(key: string, increment: number, member: string): Promise<number>;
```

### List Operations

```typescript
// Push to left
await cache.lpush(key: string, ...values: string[]): Promise<number>;

// Push to right
await cache.rpush(key: string, ...values: string[]): Promise<number>;

// Pop from left
await cache.lpop(key: string): Promise<string | null>;

// Pop from right
await cache.rpop(key: string): Promise<string | null>;

// Get range
await cache.lrange(key: string, start: number, stop: number): Promise<string[]>;

// Get length
await cache.llen(key: string): Promise<number>;
```

### Set Operations

```typescript
// Add members
await cache.sadd(key: string, ...members: string[]): Promise<number>;

// Remove members
await cache.srem(key: string, ...members: string[]): Promise<number>;

// Get all members
await cache.smembers(key: string): Promise<string[]>;

// Check membership
await cache.sismember(key: string, member: string): Promise<0 | 1>;

// Get count
await cache.scard(key: string): Promise<number>;
```

### Schema Execution

```typescript
// Execute a schema operation
await cache.execute<TParams, TResult>(
  operation: CacheOperation<TParams, TResult>,
  params: TParams
): Promise<TResult>;

// Batch operations (single round-trip)
await cache.pipeline(
  entries: PipelineEntry[]
): Promise<PipelineResult>;

// Atomic transaction
await cache.transaction(
  entries: PipelineEntry[]
): Promise<TransactionResult>;
```

---

## Schema Builder

### createTypedSchema

Create a custom schema with fluent builder.

```typescript
const schema = createTypedSchema<TKeyParams>()
  .name(name: string)                           // Schema name (required)
  .keyPattern(pattern: string)                  // Key pattern with {params} (required)
  .structure(type: "STRING" | "HASH" | "SORTED_SET" | "LIST" | "SET")
  .ttl(seconds: number)                         // Default TTL
  .maxSize(count: number)                       // Max entries (for sorted sets)
  .description(text: string)                    // Documentation
  .operations((ops) => ops                      // Add operations
    // String operations
    .addGet()
    .addSet()
    .addDelete()
    .addExpire()
    .addIncrement()
    .addDecrement()

    // Hash operations
    .addHashGet()
    .addHashSet()
    .addHashGetAll()
    .addHashSetMultiple()
    .addHashDelete()
    .addHashIncrement()

    // Sorted set operations
    .addSortedSetAdd()
    .addSortedSetRange()
    .addSortedSetRangeByScore()
    .addSortedSetRemove()
    .addSortedSetScore()
    .addSortedSetRank()
    .addSortedSetCount()
    .addSortedSetIncrement()

    // List operations
    .addListPush()
    .addListPop()
    .addListRange()

    // Custom operation
    .addCustomOperation<TCustomParams, TResult>(name, handler)
  )
  .build();
```

**Example:**

```typescript
interface UserKeyParams {
  userId: string;
}

const userSchema = createTypedSchema<UserKeyParams>()
  .name("user")
  .keyPattern("user:{userId}")
  .structure("HASH")
  .ttl(TTL.ONE_HOUR)
  .operations((ops) =>
    ops
      .addHashGetAll()
      .addHashSet()
      .addHashSetMultiple()
      .addDelete()
      .addExpire(),
  )
  .build();

// Access operations
const data = await cache.execute(userSchema.operations.hashGetAll, {
  userId: "123",
});
await cache.execute(userSchema.operations.hashSet, {
  userId: "123",
  field: "name",
  value: "John",
});
```

---

## Schema Templates

Pre-built schemas for common patterns.

### createStringSchema

```typescript
const schema = createStringSchema<TKeyParams>(
  name: string,
  keyPattern: string,
  ttl?: number
);

// Operations: get, set, delete, expire
```

### createHashSchema

```typescript
const schema = createHashSchema<TKeyParams>(
  name: string,
  keyPattern: string,
  ttl?: number
);

// Operations: hashGet, hashSet, hashGetAll, hashSetMultiple, hashDelete, hashIncrement, delete, expire
```

### createSortedSetSchema

```typescript
const schema = createSortedSetSchema<TKeyParams>(
  name: string,
  keyPattern: string,
  ttl?: number,
  maxSize?: number  // Auto-trim to this size
);

// Operations: add, remove, range, rangeByScore, score, rank, count, increment, delete, expire
```

### createCounterSchema

```typescript
const schema = createCounterSchema<TKeyParams>(
  name: string,
  keyPattern: string,
  ttl?: number
);

// Operations: increment, decrement, get, set, delete, expire
```

### createListSchema

```typescript
const schema = createListSchema<TKeyParams>(
  name: string,
  keyPattern: string,
  ttl?: number,
  maxSize?: number
);

// Operations: pushLeft, pushRight, popLeft, popRight, range, length, delete, expire
```

---

## Key Patterns

### createKeyBuilder

Single parameterized key builder.

```typescript
const builder = createKeyBuilder<{ userId: string }>("user:profile:{userId}");

builder({ userId: "123" }); // "user:profile:123"
```

### createKeyPatterns

Organized namespace of key patterns.

```typescript
const keys = createKeyPatterns(
  {
    user: {
      profile: { pattern: "user:profile:{userId}" },
      session: { pattern: "user:session:{userId}" },
      feed: { pattern: "user:feed:{userId}" },
    },
    post: {
      data: { pattern: "post:{postId}" },
      likes: { pattern: "post:{postId}:likes" },
    },
    cache: {
      query: { pattern: "cache:query:{hash}" },
    },
  },
  {
    prefix: "myapp", // Optional global prefix
    separator: ":", // Key separator (default: ":")
  },
);

// Usage
keys.user.profile({ userId: "123" }); // "myapp:user:profile:123"
keys.post.likes({ postId: "456" }); // "myapp:post:456:likes"
```

---

## Services

### RateLimitService

```typescript
const rateLimiter = createRateLimitService(adapter: CacheAdapter, config: {
  defaultConfig: {
    maxRequests: number;        // Max requests per window
    windowSeconds: number;      // Window duration
  };
  endpoints?: {                 // Per-endpoint overrides
    [endpoint: string]: {
      maxRequests: number;
      windowSeconds: number;
    };
  };
  keyPrefix?: string;           // Key prefix for rate limit keys
});

// Check rate limit
const result = await rateLimiter.check(
  identifier: string,           // User/IP identifier
  endpoint?: string             // Optional endpoint name
): Promise<{
  allowed: boolean;             // Whether request is allowed
  remaining: number;            // Remaining requests in window
  resetAt: number;              // Unix timestamp when window resets
  retryAfter?: number;          // Seconds until next request allowed
}>;

// Get HTTP headers
const headers = rateLimiter.getHeaders(result): {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
  "Retry-After"?: string;
};
```

**Example:**

```typescript
const limiter = createRateLimitService(cache.adapter, {
  defaultConfig: { maxRequests: 100, windowSeconds: 60 },
  endpoints: {
    "api:upload": { maxRequests: 10, windowSeconds: 60 },
    "api:search": { maxRequests: 30, windowSeconds: 60 },
  },
});

// In middleware
const result = await limiter.check(req.user.id, "api:upload");
if (!result.allowed) {
  res.set(limiter.getHeaders(result));
  return res.status(429).json({ error: "Too many requests" });
}
```

### LockService

```typescript
const locks = createLockService(adapter: CacheAdapter, config?: {
  keyPrefix?: string;           // Key prefix for lock keys
  defaultTtl?: number;          // Lock TTL in ms (default: 30000)
  retryDelay?: number;          // Retry delay in ms (default: 100)
  maxRetries?: number;          // Max acquire retries (default: 10)
});

// Acquire and auto-release lock
await locks.withLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  options?: {
    ttl?: number;               // Lock TTL override
    retryDelay?: number;
    maxRetries?: number;
  }
): Promise<T>;

// Manual lock management
const lock = await locks.acquire(
  lockKey: string,
  options?: LockOptions
): Promise<LockResult>;

await locks.release(lock: LockResult): Promise<boolean>;
await locks.extend(lock: LockResult, ttl: number): Promise<boolean>;
```

**Example:**

```typescript
const locks = createLockService(cache.adapter);

// Process job with lock
await locks.withLock(
  `job:${jobId}`,
  async () => {
    // Only one instance runs this
    await processJob(jobId);
  },
  { ttl: 60000 },
);

// Manual lock
const lock = await locks.acquire("resource:123");
try {
  await doWork();
} finally {
  await locks.release(lock);
}
```

---

## Actions (Workflows)

Multi-step cache workflows with dependency resolution.

```typescript
const action = defineAction<TInput>(name: string)
  .step(stepName: string, {
    operation: CacheOperation;
    params: (input: TInput) => TParams;
    retries?: number;
    undo?: (input, result, cache) => Promise<void>;
  })
  .compute(computeName: string, {
    dependsOn: string[];        // Step names this depends on
    fn: (input, deps) => Promise<TResult>;
  })
  .onError(strategy: "stop" | "skip-dependents" | "continue")
  .build();

// Execute
const result = await action.run(cache, input, {
  rollbackOnFailure?: boolean;
});
```

**Example:**

```typescript
const likePost = defineAction<{ postId: string; userId: string }>("like-post")
  .step("incrementLikes", {
    operation: counterSchema.operations.increment,
    params: (input) => ({ key: `post:${input.postId}:likes` }),
    undo: async (input, _, cache) => {
      await cache.decr(`post:${input.postId}:likes`);
    },
  })
  .step("addToUserLikes", {
    operation: setSchema.operations.add,
    params: (input) => ({
      key: `user:${input.userId}:liked`,
      member: input.postId,
    }),
  })
  .compute("newCount", {
    dependsOn: ["incrementLikes"],
    fn: async (_, deps) => deps.incrementLikes,
  })
  .onError("skip-dependents")
  .build();

const result = await likePost.run(
  cache,
  { postId: "123", userId: "456" },
  {
    rollbackOnFailure: true,
  },
);
```

---

## Types

### TTL Constants

```typescript
import { TTL } from "cachyer";

TTL.ONE_MINUTE; // 60
TTL.FIVE_MINUTES; // 300
TTL.FIFTEEN_MINUTES; // 900
TTL.THIRTY_MINUTES; // 1800
TTL.ONE_HOUR; // 3600
TTL.SIX_HOURS; // 21600
TTL.TWELVE_HOURS; // 43200
TTL.ONE_DAY; // 86400
TTL.ONE_WEEK; // 604800
TTL.ONE_MONTH; // 2592000
```

### Error Handling

```typescript
import { CacheError, CacheErrorCode } from "cachyer";

try {
  await cache.get("key");
} catch (error) {
  if (error instanceof CacheError) {
    switch (error.code) {
      case CacheErrorCode.CONNECTION_ERROR:
        // Handle connection issue
        break;
      case CacheErrorCode.TIMEOUT_ERROR:
        // Handle timeout
        break;
      case CacheErrorCode.COMMAND_ERROR:
        // Handle Redis command error
        break;
      case CacheErrorCode.SERIALIZATION_ERROR:
        // Handle JSON parse error
        break;
    }
  }
}
```

### Pipeline Entry Helper

```typescript
import { pipelineEntry } from "cachyer";

const entries = [
  pipelineEntry(schema.operations.hashGetAll, { userId: "1" }),
  pipelineEntry(schema.operations.hashGetAll, { userId: "2" }),
];

const results = await cache.pipeline(entries);
```

---

## Complete Example

```typescript
import {
  createRedisCachyer,
  createHashSchema,
  createSortedSetSchema,
  createCounterSchema,
  createKeyPatterns,
  createRateLimitService,
  pipelineEntry,
  TTL,
} from "cachyer";

// Setup
const cache = createRedisCachyer({
  keyPrefix: "myapp",
  defaultTtl: TTL.ONE_HOUR,
  connectionOptions: { host: "localhost" },
});

// Key patterns
const keys = createKeyPatterns(
  {
    user: {
      profile: { pattern: "user:{userId}:profile" },
      posts: { pattern: "user:{userId}:posts" },
    },
  },
  { prefix: "myapp" },
);

// Schemas
const userSchema = createHashSchema<{ userId: string }>(
  "user",
  "user:{userId}",
  TTL.ONE_DAY,
);

const feedSchema = createSortedSetSchema<{ userId: string }>(
  "feed",
  "feed:{userId}",
  TTL.ONE_HOUR,
  100,
);

const viewsSchema = createCounterSchema<{ postId: string }>(
  "views",
  "post:{postId}:views",
  TTL.ONE_DAY,
);

// Rate limiter
const rateLimiter = createRateLimitService(cache.adapter, {
  defaultConfig: { maxRequests: 100, windowSeconds: 60 },
});

// Usage
async function handleRequest(userId: string, postId: string) {
  // Check rate limit
  const rateResult = await rateLimiter.check(userId);
  if (!rateResult.allowed) {
    throw new Error("Rate limited");
  }

  // Get user and increment views in parallel
  const [user, views] = await Promise.all([
    cache.execute(userSchema.operations.hashGetAll, { userId }),
    cache.execute(viewsSchema.operations.increment, { postId }),
  ]);

  // Add to feed
  await cache.execute(feedSchema.operations.add, {
    userId,
    member: postId,
    score: Date.now(),
  });

  return { user, views };
}
```
