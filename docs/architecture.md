# Cachyer Architecture Guide

## What is Cachyer?

Cachyer is a **type-safe caching layer** for TypeScript. Instead of writing raw Redis commands with string keys scattered across your codebase, you define **schemas** that describe your cache structure once, and then execute fully-typed operations against them.

The core problem it solves: **cache code is usually stringly-typed, error-prone, and scattered**. Cachyer centralizes cache definitions, enforces types at compile time, and adds key prefixing, metrics, retries, and TTL management automatically.

---

## The Four Core Concepts

```
┌─────────────────────────────────────────────────────────┐
│                     Your Application                     │
└────────────────────────┬────────────────────────────────┘
                         │ execute(schema.operations.get, { userId: "123" })
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Cachyer (Facade)                        │
│  - Automatic key prefixing ("myapp:user:123:profile")    │
│  - Metrics tracking (hits, misses, latency)              │
│  - Retry logic & timeouts                                │
│  - Schema registry                                       │
│  - Serialization                                         │
└────────────────────────┬────────────────────────────────┘
                         │ adapter.hget("myapp:user:123:profile", "name")
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  CacheAdapter (Interface)                 │
│  RedisAdapter  │  MemoryAdapter  │  (future: Mongo, PG)  │
└─────────────────────────────────────────────────────────┘
```

### 1. CacheAdapter — The Backend Contract

`CacheAdapter` is the **interface** that every storage backend must implement. It defines ~60+ methods covering all data structures: strings, hashes, lists, sets, sorted sets, plus optional support for streams, HyperLogLog, Bloom filters, pub/sub, and scripting.

**You never call adapter methods directly for normal operations.** The adapter is the low-level driver; Cachyer wraps it.

```typescript
import { createRedisAdapter } from "cachyer/redis";
import { createMemoryAdapter } from "cachyer/memory";

// For production
const redisAdapter = createRedisAdapter({ host: "localhost", port: 6379 });

// For testing (no dependencies, in-memory)
const memoryAdapter = createMemoryAdapter();
```

**Purpose:** Abstracts away the storage engine so you can swap Redis for memory (in tests) or add new backends without changing application code.

### 2. CacheSchema — The Cache Definition

A `CacheSchema` is a **complete description of a cached entity**: its key pattern, data structure, TTL, and all the operations you can perform on it.

```typescript
// CacheSchema<TKeyParams, TOperations>
type UserProfileSchema = CacheSchema<
  { userId: string },              // key parameters
  {
    get: CacheOperation<...>;      // typed operations
    set: CacheOperation<...>;
    delete: CacheOperation<...>;
  }
>;
```

A schema contains:
| Field | Purpose |
|---|---|
| `name` | Unique identifier for registration/discovery |
| `key(params)` | Function that generates the cache key from typed parameters |
| `structure` | Data structure type: `STRING`, `HASH`, `SET`, `SORTED_SET`, `LIST`, etc. |
| `ttl` | Default time-to-live in seconds |
| `operations` | Record of named, typed operations |
| `namespace`, `version`, `tags` | Optional metadata |

**You build schemas using the fluent builder** (not by hand):

```typescript
import { createTypedSchema } from "cachyer";

const userProfile = createTypedSchema<{ userId: string }>()
  .name("userProfile")
  .keyPattern("user:{userId}:profile")   // type-safe — TS knows {userId} maps to params
  .structure("HASH")
  .ttl(3600)                              // 1 hour
  .operations((ops) =>
    ops
      .addHashGet()        // → operations.hashGetField
      .addHashSet()        // → operations.hashSet
      .addHashGetAll()     // → operations.hashGetAll
      .addDelete()         // → operations.delete
  )
  .build();
```

**Purpose:** Schemas are the single source of truth for how a cache entity works. Define once, use everywhere with full type safety.

### 3. CacheOperation — A Single Typed Command

A `CacheOperation<TParams, TResult>` represents **one executable cache command** with typed inputs and outputs.

```typescript
interface CacheOperation<TParams, TResult> {
  command: CacheCommand;                          // e.g. "HGET"
  buildArgs(params: TParams): (string | number)[];  // params → Redis args
  parseResult?(result: unknown): TResult;         // raw result → typed result
  description?: string;
}
```

When you call `ops.addHashGet()` in the schema builder, it creates an operation like:

```typescript
// operations.hashGetField
{
  command: "HGET",
  buildArgs({ userId, field }) {
    return ["user:123:profile", "name"];  // key generated from pattern + params
  },
  parseResult(raw) {
    return raw as string | null;  // typed return
  }
}
```

**You don't create operations manually.** The schema builder generates them. You just **execute** them:

```typescript
// TypeScript knows:
// - params must be { userId: string, field: string }
// - result is string | null
const name = await cachyer.execute(userProfile.operations.hashGetField, {
  userId: "123",
  field: "name",
});
```

**Purpose:** Operations are the atomic unit of cache interaction. They encode both the command logic and the type contract.

### 4. Cachyer — The Facade

The `Cachyer` class is the **main entry point** you interact with. It wraps an adapter and adds:

| Feature | What it does |
|---|---|
| **Key prefixing** | Automatically prepends `keyPrefix:` to all keys, preventing collisions between apps/environments |
| **Metrics** | Tracks hits, misses, operation counts, latency |
| **Retries & timeouts** | Configurable retry logic with exponential backoff |
| **Schema registry** | Store and discover schemas at runtime |
| **Logging** | Optional structured logging |
| **Serialization** | JSON by default, pluggable |

```typescript
import { createCachyer, createRedisAdapter } from "cachyer";

const cache = createCachyer({
  adapter: createRedisAdapter({ host: "localhost" }),
  keyPrefix: "myapp:prod",     // all keys get this prefix
  defaultTtl: 3600,
  enableMetrics: true,
});
```

---

## How They Work Together

Here's the full lifecycle of a cache operation:

```
1. You define a schema:
   const userProfile = createTypedSchema<{ userId: string }>()
     .name("userProfile")
     .keyPattern("user:{userId}:profile")
     .structure("HASH")
     .ttl(3600)
     .operations((ops) => ops.addHashGet().addHashSet())
     .build();

2. You create a Cachyer instance:
   const cache = createCachyer({
     adapter: createRedisAdapter(),
     keyPrefix: "myapp",
   });

3. You execute an operation:
   const name = await cache.execute(
     userProfile.operations.hashGetField,
     { userId: "123", field: "name" }
   );

4. Internally, Cachyer:
   a. Calls operation.buildArgs({ userId: "123", field: "name" })
      → ["user:123:profile", "name"]
   b. Applies key prefix → ["myapp:user:123:profile", "name"]
   c. Maps command "HGET" → adapter.hget("myapp:user:123:profile", "name")
   d. Wraps with timeout (5s) and retry logic (2 retries)
   e. Calls operation.parseResult(rawResult) → string | null
   f. Records metrics (operation count, latency)
   g. Returns the typed result to you
```

---

## What is `registerSchema`?

`registerSchema` is an **optional** method that stores a schema in Cachyer's internal registry (a `Map<string, CacheSchema>`). It serves as a **runtime catalog** of all cache schemas in your application.

```typescript
cache.registerSchema(userProfile);
cache.registerSchema(postCache);
cache.registerSchema(sessionCache);

// Later: discover what schemas exist
cache.listSchemas();  // ["userProfile", "postCache", "sessionCache"]

// Retrieve a schema by name
const schema = cache.getSchema("userProfile");
```

**When is it useful?**

- **Debugging/introspection:** See all cache schemas registered in your app at runtime
- **Admin dashboards:** List all cache entities, their structures, and TTLs
- **Documentation:** Self-documenting cache layer — query what exists
- **Dynamic dispatch:** Look up a schema by name and execute operations programmatically

**It is NOT required for executing operations.** You can use `cache.execute(schema.operations.get, params)` without ever calling `registerSchema`. The registry is purely for discoverability.

---

## Quick Start

### Installation

```bash
npm install cachyer
```

### 1. Define Your Schemas

```typescript
// schemas/user.ts
import { createTypedSchema, TTL } from "cachyer";

// A hash to store user profiles
export const userProfileSchema = createTypedSchema<{ userId: string }>()
  .name("userProfile")
  .keyPattern("user:{userId}:profile")
  .structure("HASH")
  .ttl(TTL.ONE_HOUR)
  .operations((ops) =>
    ops
      .addHashSet()
      .addHashGet()
      .addHashGetAll()
      .addHashSetMultiple()
      .addDelete()
      .addExists()
  )
  .build();

// A sorted set for user activity feed
export const userFeedSchema = createTypedSchema<{ userId: string }>()
  .name("userFeed")
  .keyPattern("user:{userId}:feed")
  .structure("SORTED_SET")
  .ttl(TTL.ONE_DAY)
  .maxSize(100)
  .operations((ops) =>
    ops
      .addSortedSetAdd()
      .addSortedSetGetRange()
      .addSortedSetRemove()
      .addSortedSetCount()
  )
  .build();

// A simple string counter
export const pageViewSchema = createTypedSchema<{ pageId: string }>()
  .name("pageViews")
  .keyPattern("page:{pageId}:views")
  .structure("STRING")
  .ttl(TTL.ONE_DAY)
  .operations((ops) =>
    ops.addGet().addIncrement().addIncrementBy()
  )
  .build();
```

### 2. Create the Cache Instance

```typescript
// cache.ts
import { createCachyer, createRedisAdapter } from "cachyer";

export const cache = createCachyer({
  adapter: createRedisAdapter({ host: "localhost", port: 6379 }),
  keyPrefix: "myapp",
  defaultTtl: 3600,
});
```

### 3. Use in Your Application

```typescript
// services/user.service.ts
import { cache } from "../cache";
import { userProfileSchema } from "../schemas/user";

// Set a field
await cache.execute(userProfileSchema.operations.hashSet, {
  userId: "42",
  field: "name",
  value: "Alice",
});

// Set multiple fields at once
await cache.execute(userProfileSchema.operations.hashSetMultiple, {
  userId: "42",
  fields: { email: "alice@example.com", role: "admin" },
});

// Get a single field — returns string | null (typed!)
const name = await cache.execute(userProfileSchema.operations.hashGetField, {
  userId: "42",
  field: "name",
});

// Get all fields — returns Record<string, string> (typed!)
const profile = await cache.execute(userProfileSchema.operations.hashGetAll, {
  userId: "42",
});
```

### 4. Use Convenience Methods for Simple Cases

When you don't need schema-level type safety, Cachyer provides direct methods:

```typescript
// Simple key-value (key prefix is applied automatically)
await cache.set("config:feature-flags", JSON.stringify({ darkMode: true }), 3600);
const flags = await cache.get("config:feature-flags");

// Cache-aside pattern: fetch from cache, or run the function and cache the result
const user = await cache.getOrFetch("user:42", async () => {
  return await db.users.findById(42);
}, 3600);

// Direct hash operations
await cache.hset("session:abc", "lastActive", Date.now().toString());
const session = await cache.hgetall("session:abc");
```

### 5. Access Advanced Features via Adapter

For features like streams, Bloom filters, and HyperLogLog, go through `cache.adapter` directly (no key prefixing):

```typescript
// Streams
await cache.adapter.xadd("events:stream", "*", { type: "login", userId: "42" });

// Bloom filters
await cache.adapter.bfReserve("emails:filter", 0.01, 100000);
await cache.adapter.bfAdd("emails:filter", "alice@example.com");
const exists = await cache.adapter.bfExists("emails:filter", "alice@example.com");
```

### 6. Use Built-in Services

```typescript
import { createRateLimitService, createLockService } from "cachyer";

// Rate limiting
const rateLimiter = createRateLimitService(cache.adapter, {
  limits: { default: { maxRequests: 100, windowMs: 60000 } },
});
const result = await rateLimiter.check("user:42", "default");
if (!result.allowed) {
  res.set(result.headers);
  return res.status(429).send("Too many requests");
}

// Distributed locking
const lockService = createLockService(cache.adapter);
await lockService.withLock("order:123", async () => {
  // Only one process can execute this at a time
  await processOrder("123");
});
```

### 7. Use Schema Templates for Common Patterns

Instead of building from scratch, use pre-built templates:

```typescript
import {
  createKeyValueSchema,
  createHashSchema,
  createSortedSetSchema,
  createCounterSchema,
} from "cachyer";

// These come with all standard operations pre-configured
const sessionSchema = createKeyValueSchema("session", "session:{sessionId}", 1800);
const userSchema = createHashSchema("user", "user:{userId}", 3600);
const leaderboard = createSortedSetSchema("leaderboard", "lb:{game}", 86400, 100);
const hitCounter = createCounterSchema("hits", "hits:{endpoint}", 3600);
```

### Testing with Memory Adapter

```typescript
import { createMemoryCachyer } from "cachyer";

// No Redis needed — perfect for unit tests
const cache = createMemoryCachyer({ keyPrefix: "test" });
```

---

## Summary Table

| Concept | What it is | Purpose |
|---|---|---|
| **CacheAdapter** | Interface for storage backends | Swap Redis/Memory/future backends without code changes |
| **CacheSchema** | Full definition of a cache entity | Single source of truth: key pattern + structure + TTL + operations |
| **CacheOperation** | One typed cache command | Type-safe params in, typed result out |
| **Cachyer** | Main facade class | Key prefixing, metrics, retries, logging — the API you use |
| **Schema Builder** | Fluent API to create schemas | Build schemas with IDE autocomplete and compile-time safety |
| **registerSchema** | Runtime schema catalog | Optional — for introspection, admin tools, and dynamic dispatch |
| **Services** | Rate limiting & distributed locks | Production-ready solutions built on top of adapters |
| **Key Patterns** | Template strings like `user:{id}:profile` | Type-safe, parameterized key generation |
