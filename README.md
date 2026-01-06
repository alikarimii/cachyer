# Cachyer

A flexible, type-safe caching layer with support for multiple database adapters (Redis, MongoDB, PostgreSQL, and more).

## Features

- 🔌 **Pluggable Adapters** - Redis, In-Memory (built-in), with easy extension for MongoDB, PostgreSQL, CouchDB
- 📝 **Type-Safe** - Full TypeScript support with generics and type inference
- 🏗️ **Schema Builder** - Define your cache schemas with a fluent API
- ⚡ **High Performance** - Pipeline and transaction support, Lua script caching
- 🔒 **Rate Limiting** - Built-in rate limiting service with multiple algorithms
- 📊 **Metrics** - Built-in metrics collection for monitoring
- 🧪 **Testing-Friendly** - In-memory adapter for unit tests

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Examples](#examples)
- [Key Patterns](#key-patterns)
- [Rate Limiting](#rate-limiting)
- [API Reference](#api-reference)

## Installation

```bash
npm install cachyer

# With Redis adapter
npm install cachyer ioredis

# With MongoDB adapter (coming soon)
npm install cachyer mongodb
```

## Quick Start

### Basic Usage with Redis

```typescript
import Redis from "ioredis";
import { createRedisCachyer } from "cachyer";

// Create Redis client
const redis = new Redis("redis://localhost:6379");

// Create Cachyer instance
const cache = createRedisCachyer(redis, {
  keyPrefix: "myapp",
  defaultTtl: 3600, // 1 hour
});

// Basic operations
await cache.set("user:1", JSON.stringify({ name: "John" }));
const user = await cache.get("user:1");

// Hash operations
await cache.hset("profile:1", "name", "John");
await cache.hset("profile:1", "email", "john@example.com");
```

## Architecture

**Important:** Cachyer uses a two-layer architecture:

```typescript
// Core operations: Use Cachyer (automatic key prefixing)
await cache.get('user:123')
await cache.zadd('leaderboard', [...])

// Advanced features: Use adapter directly (NO key prefixing)
await cache.adapter.xadd('logs', '*', { msg: 'hello' })
await cache.adapter.bfAdd('bloom:users', 'user123')
```

**Why two layers?**

- **Cachyer**: Core operations everyone needs (get/set/hashes/sorted sets) with key prefixing, metrics, and logging
- **Adapter**: Advanced features (streams, bloom filters, hyperloglog, geo) with full control

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed explanation, including:

- When to use Cachyer vs Adapter
- Key prefixing behavior
- Examples for different use cases
- Implementation guidelines

## Examples

Check out the [`examples/`](./examples) directory for complete, working examples:

- **[Social Media Cache](./examples/social-media-cache.ts)** - Complete example showing feeds, engagement tracking, activity streams, and social graphs
- **[Domain-Specific Types](./examples/social-media-types.ts)** - How to extend Cachyer's generic types for your specific domain

The examples demonstrate:

- Type-safe key patterns with `createKeyPatterns`
- Building domain-specific parameter types
- Cache service layers for complex applications
- Using sorted sets, hashes, sets, lists, and streams
- Best practices for organizing cache logic
- **Using adapter for advanced features** (streams, bloom filters)

### Quick Example: Core vs Advanced Operations

```typescript
const cache = new Cachyer({ adapter: redisAdapter, keyPrefix: "myapp" });

// Core operations via Cachyer
await cache.set("user:1", JSON.stringify({ name: "John" }));
await cache.hset("profile:1", "email", "john@example.com");
const profile = await cache.hgetall("profile:1");

// Sorted sets (for feeds, leaderboards)
await cache.zadd("leaderboard", [
  { score: 100, member: "player1" },
  { score: 200, member: "player2" },
]);
const top10 = await cache.zrevrange("leaderboard", 0, 9, { withScores: true });

// Advanced: Redis Streams via adapter
await cache.adapter.xadd("myapp:logs", "*", {
  level: "info",
  message: "User logged in",
  userId: "123",
});

// Advanced: Bloom Filters via adapter
await cache.adapter.bfReserve("myapp:users:bloom", 0.01, 10000);
await cache.adapter.bfAdd("myapp:users:bloom", "user123");
const exists = await cache.adapter.bfExists("myapp:users:bloom", "user123");
```

````

### Using the In-Memory Adapter (for testing)

```typescript
import { createMemoryCachyer } from "cachyer";

const cache = createMemoryCachyer({
  keyPrefix: "test",
  maxEntries: 1000,
});

// Works exactly like Redis!
await cache.set("key", "value");
````

## Defining Custom Schemas

Cachyer allows you to define type-safe cache schemas:

```typescript
import { createSchema, TTL } from "cachyer";

// Define your parameter types
interface UserProfileParams {
  userId: string;
}

// Create a schema
const userProfileSchema = createSchema<UserProfileParams>()
  .name("userProfile")
  .keyPattern("user:profile:{userId}")
  .structure("HASH")
  .ttl(TTL.ONE_HOUR)
  .description("User profile cache")
  .operations((ops) => {
    ops
      .addHashGetAll<UserProfile>()
      .addHashSet()
      .addHashSetMultiple()
      .addDelete()
      .addExists()
      .addExpire()
      .addTtl();
  })
  .build();

// Use with executor
const result = await cache.execute(userProfileSchema.operations.getAll, {
  userId: "123",
});
```

### Pre-built Schema Templates

```typescript
import {
  createKeyValueSchema,
  createHashSchema,
  createSortedSetSchema,
  createSetSchema,
  createCounterSchema,
} from "cachyer";

// Simple key-value cache
const sessionSchema = createKeyValueSchema<{ sessionId: string }>(
  "session",
  "session:{sessionId}",
  3600 // TTL in seconds
);

// Hash for complex objects
const userSchema = createHashSchema<{ userId: string }>(
  "user",
  "user:{userId}",
  7200
);

// Sorted set for feeds
const feedSchema = createSortedSetSchema<{ userId: string }>(
  "feed",
  "user:feed:{userId}",
  3600,
  500 // maxSize
);

// Set for relationships
const followersSchema = createSetSchema<{ userId: string }>(
  "followers",
  "user:followers:{userId}",
  86400
);

// Counter for rate limiting
const apiCounterSchema = createCounterSchema<{
  userId: string;
  endpoint: string;
}>("apiCounter", "ratelimit:{endpoint}:{userId}", 60);
```

## Rate Limiting

Built-in rate limiting service with multiple algorithms:

```typescript
import { createRedisAdapter, createRateLimitService } from "cachyer";

const adapter = createRedisAdapter({ client: redis });
const rateLimiter = createRateLimitService(adapter, {
  keyPrefix: "ratelimit",
  defaultConfig: { maxRequests: 100, windowSeconds: 60 },
  endpoints: {
    "api:create": { maxRequests: 10, windowSeconds: 60 },
    "api:search": { maxRequests: 30, windowSeconds: 60 },
  },
});

// Check rate limit
const result = await rateLimiter.check("user123", "api:create");

if (!result.allowed) {
  console.log(`Rate limited. Retry after ${result.retryAfter}s`);
  // Use result.headers for HTTP response
}

// Sliding window (more accurate)
const slidingResult = await rateLimiter.checkSlidingWindow(
  "user123",
  "api:create"
);

// IP-based rate limiting
const ipResult = await rateLimiter.checkIP("192.168.1.1", {
  maxRequests: 100,
  windowSeconds: 60,
});
```

## Pipeline & Transactions

Execute multiple operations efficiently:

```typescript
import { pipelineEntry } from "cachyer";

// Pipeline (batched operations)
const result = await cache.pipeline([
  pipelineEntry(userSchema.operations.getAll, { userId: "1" }),
  pipelineEntry(userSchema.operations.getAll, { userId: "2" }),
  pipelineEntry(userSchema.operations.getAll, { userId: "3" }),
]);

// Transaction (atomic)
const txResult = await cache.transaction([
  pipelineEntry(counterSchema.operations.increment, { userId: "1" }),
  pipelineEntry(feedSchema.operations.add, {
    userId: "1",
    member: "post:123",
    score: Date.now(),
  }),
]);
```

## Creating Custom Adapters

Implement the `CacheAdapter` interface to support any database:

```typescript
import { CacheAdapter, ConnectionStatus, ExecutorMetrics } from "cachyer";

class MongoCacheAdapter implements CacheAdapter {
  readonly name = "mongodb";
  private _status: ConnectionStatus = "disconnected";

  get status() {
    return this._status;
  }

  async connect(): Promise<void> {
    // Connect to MongoDB
    this._status = "ready";
  }

  async disconnect(): Promise<void> {
    this._status = "disconnected";
  }

  isConnected(): boolean {
    return this._status === "ready";
  }

  async ping(): Promise<boolean> {
    return true;
  }

  // Implement all required methods...
  async set(key: string, value: string, options?: CacheSetOptions) {
    // Store in MongoDB
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    // Retrieve from MongoDB
    return null;
  }

  // ... implement remaining methods
}
```

## Key Patterns

Build type-safe cache keys:

```typescript
import { createKeyBuilder, createKeyPattern } from "cachyer";

// Create a key builder
const userKey = createKeyBuilder<{ userId: string }>("user:profile:{userId}");
console.log(userKey({ userId: "123" })); // 'user:profile:123'

// With prefix
const userKey = createKeyBuilder<{ userId: string }>("profile:{userId}", {
  prefix: "myapp",
});
console.log(userKey({ userId: "123" })); // 'myapp:profile:123'

// Create patterns for scanning
const pattern = createKeyPattern("user", "profile");
console.log(pattern); // 'user:profile:*'
```

### Advanced: Organized Key Pattern Factory

For large applications with many key patterns, use `createKeyPatterns` to organize them:

```typescript
import { createKeyPatterns } from "cachyer";

// Define all your key patterns in one place
const keys = createKeyPatterns(
  {
    user: {
      profile: { pattern: "user:profile:{userId}" },
      feed: { pattern: "user:feed:{userId}" },
      followers: { pattern: "user:followers:{userId}" },
      settings: { pattern: "user:settings:{userId}:{setting}" },
      // Static keys (no parameters)
      allUsers: "user:all",
    },
    post: {
      data: { pattern: "post:{postId}" },
      likes: { pattern: "post:likes:{postId}" },
      comments: { pattern: "post:comments:{postId}" },
    },
    session: {
      token: { pattern: "session:token:{token}" },
      user: { pattern: "session:user:{userId}" },
    },
  },
  { prefix: "myapp" }
);

// Type-safe usage with autocomplete
const profileKey = keys.user.profile({ userId: "123" });
// 'myapp:user:profile:123'

const settingsKey = keys.user.settings({ userId: "123", setting: "theme" });
// 'myapp:user:settings:123:theme'

const allUsersKey = keys.user.allUsers();
// 'myapp:user:all'

const postKey = keys.post.data({ postId: "456" });
// 'myapp:post:456'
```

**Benefits of `createKeyPatterns`:**

- ✅ Centralized key management
- ✅ Full TypeScript type safety and autocomplete
- ✅ Consistent key structure across your app
- ✅ Easy refactoring - change patterns in one place
- ✅ Supports both parameterized and static keys

## TTL Presets

```typescript
import { TTL } from "cachyer";

TTL.ONE_MINUTE; // 60
TTL.FIVE_MINUTES; // 300
TTL.FIFTEEN_MINUTES; // 900
TTL.THIRTY_MINUTES; // 1800
TTL.ONE_HOUR; // 3600
TTL.TWO_HOURS; // 7200
TTL.SIX_HOURS; // 21600
TTL.TWELVE_HOURS; // 43200
TTL.ONE_DAY; // 86400
TTL.ONE_WEEK; // 604800
TTL.ONE_MONTH; // 2592000
```

## Metrics

```typescript
// Get metrics
const metrics = cache.getMetrics();
console.log(metrics);
// {
//   totalOperations: 1000,
//   successfulOperations: 995,
//   failedOperations: 5,
//   totalExecutionTimeMs: 5000,
//   avgExecutionTimeMs: 5,
//   operationCounts: { GET: 500, SET: 300, ... }
// }

// Reset metrics
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
      case CacheErrorCode.CONNECTION_ERROR:
        // Handle connection issues
        break;
      case CacheErrorCode.TIMEOUT_ERROR:
        // Handle timeouts
        break;
      case CacheErrorCode.COMMAND_ERROR:
        // Handle command failures
        break;
    }
  }
}
```

## Configuration Options

```typescript
const cache = new Cachyer({
  adapter: createRedisAdapter({ client: redis }),

  // Global key prefix
  keyPrefix: "myapp",

  // Default TTL for all operations
  defaultTtl: 3600,

  // Custom serializer
  serializer: {
    serialize: (value) => JSON.stringify(value),
    deserialize: (value) => JSON.parse(value.toString()),
  },

  // Custom logger
  logger: {
    debug: (msg, meta) => console.debug(msg, meta),
    info: (msg, meta) => console.info(msg, meta),
    warn: (msg, meta) => console.warn(msg, meta),
    error: (msg, meta) => console.error(msg, meta),
  },

  // Default execution options
  defaultOptions: {
    timeout: 5000,
    retries: 2,
    retryDelay: 100,
    throwOnError: true,
  },

  // Enable metrics collection
  enableMetrics: true,

  // Auto-connect on creation
  autoConnect: true,
});
```

## API Reference

### Cachyer Class

| Method                                  | Description                       |
| --------------------------------------- | --------------------------------- |
| `connect()`                             | Connect to the cache backend      |
| `disconnect()`                          | Disconnect from the cache backend |
| `isConnected()`                         | Check if connected                |
| `ping()`                                | Ping the backend                  |
| `get(key)`                              | Get a string value                |
| `set(key, value, options?)`             | Set a string value                |
| `del(...keys)`                          | Delete keys                       |
| `exists(...keys)`                       | Check if keys exist               |
| `expire(key, seconds)`                  | Set expiration                    |
| `ttl(key)`                              | Get TTL                           |
| `hget(key, field)`                      | Get hash field                    |
| `hset(key, field, value)`               | Set hash field                    |
| `hgetall(key)`                          | Get all hash fields               |
| `zadd(key, scoreMembers)`               | Add to sorted set                 |
| `zrange(key, start, stop, options?)`    | Get sorted set range              |
| `zrevrange(key, start, stop, options?)` | Get reverse sorted set range      |
| `incr(key)`                             | Increment value                   |
| `sadd(key, ...members)`                 | Add to set                        |
| `smembers(key)`                         | Get set members                   |
| `lpush(key, ...values)`                 | Push to list                      |
| `lrange(key, start, stop)`              | Get list range                    |
| `execute(operation, params)`            | Execute a cache operation         |
| `executeScript(script, keys, args)`     | Execute a Lua script              |
| `pipeline(entries)`                     | Execute operations in pipeline    |
| `transaction(entries)`                  | Execute operations in transaction |
| `getMetrics()`                          | Get execution metrics             |
| `resetMetrics()`                        | Reset metrics                     |

## License

MIT
