# Cachyer

Type-safe caching layer for Node.js with pluggable adapters, schema-driven operations, and built-in services for rate limiting, distributed locking, and multi-step workflows.

## Install

```bash
npm install cachyer

# Redis adapter requires ioredis
npm install cachyer ioredis
```

## Quick Start

```typescript
import { createRedisCachyer } from "cachyer";

const cache = createRedisCachyer({
  keyPrefix: "myapp",
  defaultTtl: 3600,
  connectionOptions: { host: "localhost", port: 6379 },
});

// String operations
await cache.set("user:1", JSON.stringify({ name: "John" }));
const user = await cache.get("user:1");

// Hash operations
await cache.hset("profile:1", "name", "John");
await cache.hset("profile:1", "email", "john@example.com");
const profile = await cache.hgetall("profile:1");

// Sorted sets
await cache.zadd("leaderboard", [
  { score: 100, member: "player1" },
  { score: 200, member: "player2" },
]);
const top10 = await cache.zrevrange("leaderboard", 0, 9, { withScores: true });
```

### In-Memory (for testing)

```typescript
import { createMemoryCachyer } from "cachyer";

const cache = createMemoryCachyer({ keyPrefix: "test", maxEntries: 1000 });
// Same API as Redis — swap adapters without changing code
```

## Two-Layer Architecture

Cachyer has two layers:

```typescript
// Layer 1: Cachyer — core ops with automatic key prefixing + metrics
await cache.get("user:123");          // actual key: "myapp:user:123"
await cache.zadd("leaderboard", [...]);

// Layer 2: Adapter — advanced features, direct access, NO key prefixing
await cache.adapter.xadd("myapp:logs", "*", { msg: "hello" });
await cache.adapter.bfAdd("myapp:bloom", "user123");
```

**Cachyer** handles the operations everyone needs (get/set/hashes/sorted sets/lists) and adds key prefixing, metrics, logging. **Adapter** gives direct access to advanced Redis features (streams, bloom filters, HyperLogLog, geo). See [docs/architecture.md](./docs/architecture.md) for details.

## Type-Safe Schemas

Define cache entities with a fluent builder:

```typescript
import { createTypedSchema, TTL } from "cachyer";

const userSchema = createTypedSchema<{ userId: string }>()
  .name("user")
  .keyPattern("user:{userId}")
  .structure("HASH")
  .ttl(TTL.ONE_HOUR)
  .operations((ops) =>
    ops.addHashGetAll().addHashSet().addDelete().addExpire(),
  )
  .build();

const data = await cache.execute(userSchema.operations.hashGetAll, {
  userId: "123",
});
```

Pre-built templates for common patterns:

```typescript
import { createHashSchema, createSortedSetSchema, createCounterSchema } from "cachyer";

const userSchema    = createHashSchema<{ userId: string }>("user", "user:{userId}", 7200);
const feedSchema    = createSortedSetSchema<{ userId: string }>("feed", "user:feed:{userId}", 3600, 500);
const counterSchema = createCounterSchema<{ userId: string }>("counter", "api:count:{userId}", 60);
```

See [docs/schema-builder.md](./docs/schema-builder.md) for the full builder API, custom operations, and all available operation methods.

## Pipeline & Transaction

Batch operations into a single round-trip:

```typescript
import { pipelineEntry } from "cachyer";

const result = await cache.pipeline([
  pipelineEntry(userSchema.operations.hashGetAll, { userId: "1" }),
  pipelineEntry(userSchema.operations.hashGetAll, { userId: "2" }),
  pipelineEntry(userSchema.operations.hashGetAll, { userId: "3" }),
]);

// Atomic transactions
const txResult = await cache.transaction([
  pipelineEntry(counterSchema.operations.increment, { userId: "1" }),
  pipelineEntry(feedSchema.operations.add, { userId: "1", member: "post:123", score: Date.now() }),
]);
```

## Multi-Step Workflows (CacheAction)

Orchestrate complex multi-step cache operations with dependency resolution, pipeline batching, retry, and rollback:

```typescript
import { defineAction, pipelineEntry } from "cachyer";

const postLiked = defineAction<{ postId: string; userId: string }>("post-liked")
  .step("incrLikes", {
    operation: incrOp,
    params: (i) => ({ key: `post:${i.postId}:likes` }),
    retries: 2,
  })
  .step("setFlag", {
    operation: setOp,
    params: (i) => ({ key: `user:${i.userId}:liked:${i.postId}`, value: "1" }),
    undo: async (input, _result, cache) => {
      await cache.del(`user:${input.userId}:liked:${input.postId}`);
    },
  })
  .compute("score", {
    dependsOn: ["incrLikes"] as const,
    fn: async (_input, deps) => Math.log10(deps.incrLikes + 1) * 10,
  })
  .onError("skip-dependents")
  .build();

const result = await postLiked.run(cache, { postId: "p1", userId: "u1" }, {
  rollbackOnFailure: true,
});
```

See [docs/actions.md](./docs/actions.md) for step types, error strategies, retry configuration, and rollback.

## Key Patterns

Type-safe parameterized cache keys:

```typescript
import { createKeyBuilder, createKeyPatterns } from "cachyer";

// Single key builder
const userKey = createKeyBuilder<{ userId: string }>("user:profile:{userId}");
userKey({ userId: "123" }); // "user:profile:123"

// Organized key patterns for larger apps
const keys = createKeyPatterns({
  user: {
    profile: { pattern: "user:profile:{userId}" },
    feed: { pattern: "user:feed:{userId}" },
  },
  post: {
    data: { pattern: "post:{postId}" },
  },
}, { prefix: "myapp" });

keys.user.profile({ userId: "123" }); // "myapp:user:profile:123"
```

See [docs/key-patterns.md](./docs/key-patterns.md) for static keys and scan patterns.

## Rate Limiting

Multiple algorithms out of the box:

```typescript
import { createRateLimitService } from "cachyer";

const rateLimiter = createRateLimitService(adapter, {
  defaultConfig: { maxRequests: 100, windowSeconds: 60 },
  endpoints: {
    "api:create": { maxRequests: 10, windowSeconds: 60 },
  },
});

const result = await rateLimiter.check("user123", "api:create");
if (!result.allowed) {
  console.log(`Retry after ${result.retryAfter}s`);
}
```

See [docs/rate-limiting.md](./docs/rate-limiting.md) for sliding window, token bucket, multi-tier, and quota-based strategies.

## Distributed Locking

```typescript
import { createLockService } from "cachyer";

const lockService = createLockService(adapter);

await lockService.withLock("job:123", async () => {
  // Only one instance runs this at a time
  await processJob("123");
});
```

See [docs/lock-service.md](./docs/lock-service.md) for manual lock management and configuration.

## Configuration

```typescript
const cache = new Cachyer({
  adapter: createRedisAdapter({ client: redis }),
  keyPrefix: "myapp",
  defaultTtl: 3600,
  serializer: {
    serialize: (value) => JSON.stringify(value),
    deserialize: (value) => JSON.parse(value.toString()),
  },
  logger: {
    debug: (msg, meta) => console.debug(msg, meta),
    info: (msg, meta) => console.info(msg, meta),
    warn: (msg, meta) => console.warn(msg, meta),
    error: (msg, meta) => console.error(msg, meta),
  },
  defaultOptions: {
    timeout: 5000,
    retries: 2,
    retryDelay: 100,
    throwOnError: true,
  },
  enableMetrics: true,
  autoConnect: true,
});
```

## Metrics

```typescript
const metrics = cache.getMetrics();
// { totalOperations, successfulOperations, failedOperations,
//   totalExecutionTimeMs, avgExecutionTimeMs, operationCounts }

cache.resetMetrics();
```

## Error Handling

```typescript
import { CacheError, CacheErrorCode } from "cachyer";

try {
  await cache.execute(operation, params);
} catch (error) {
  if (error instanceof CacheError) {
    switch (error.code) {
      case CacheErrorCode.CONNECTION_ERROR: break;
      case CacheErrorCode.TIMEOUT_ERROR: break;
      case CacheErrorCode.COMMAND_ERROR: break;
    }
  }
}
```

## TTL Presets

```typescript
import { TTL } from "cachyer";

TTL.ONE_MINUTE;       // 60
TTL.FIVE_MINUTES;     // 300
TTL.FIFTEEN_MINUTES;  // 900
TTL.THIRTY_MINUTES;   // 1800
TTL.ONE_HOUR;         // 3600
TTL.SIX_HOURS;        // 21600
TTL.ONE_DAY;          // 86400
TTL.ONE_WEEK;         // 604800
TTL.ONE_MONTH;        // 2592000
```

## Documentation

| Topic | Link |
|-------|------|
| Architecture (two-layer design) | [docs/architecture.md](./docs/architecture.md) |
| Schema Builder & Templates | [docs/schema-builder.md](./docs/schema-builder.md) |
| Key Patterns | [docs/key-patterns.md](./docs/key-patterns.md) |
| CacheAction (Workflows) | [docs/actions.md](./docs/actions.md) |
| Rate Limiting | [docs/rate-limiting.md](./docs/rate-limiting.md) |
| Distributed Lock Service | [docs/lock-service.md](./docs/lock-service.md) |
| Adapters (Redis, Memory, Custom) | [docs/adapters.md](./docs/adapters.md) |
| Utilities (Cache-Aside, Pagination, Scoring) | [docs/utilities.md](./docs/utilities.md) |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions, code guidelines, and the PR checklist.

## License

MIT
