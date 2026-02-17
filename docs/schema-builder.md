# Schema Builder

Define type-safe cache schemas with a fluent API. Schemas describe the shape of a cache entry — its name, key pattern, data structure, TTL, and available operations.

## Fluent Builder

```typescript
import { createTypedSchema, TTL } from "cachyer";

interface UserProfileParams {
  userId: string;
}

const userProfileSchema = createTypedSchema<UserProfileParams>()
  .name("userProfile")
  .keyPattern("user:profile:{userId}")
  .structure("HASH")
  .ttl(TTL.ONE_HOUR)
  .description("User profile cache")
  .operations((ops) =>
    ops
      .addHashGetAll()
      .addHashSet()
      .addHashSetMultiple()
      .addDelete()
      .addExists()
      .addExpire()
      .addTtl(),
  )
  .build();

// Execute an operation
const profile = await cache.execute(userProfileSchema.operations.hashGetAll, {
  userId: "123",
});
```

The builder chain enforces order: `name` -> `keyPattern` -> `structure` -> `ttl` -> `operations` -> `build`.

## Pre-Built Templates

For common data structures, use the template functions instead of the full builder:

```typescript
import {
  createKeyValueSchema,
  createHashSchema,
  createSortedSetSchema,
  createSetSchema,
  createCounterSchema,
  createHyperLogLogSchema,
  createBloomFilterSchema,
} from "cachyer";

// Simple key-value
const sessionSchema = createKeyValueSchema<{ sessionId: string }>(
  "session",
  "session:{sessionId}",
  3600,
);

// Hash for complex objects
const userSchema = createHashSchema<{ userId: string }>(
  "user",
  "user:{userId}",
  7200,
);

// Sorted set for feeds/leaderboards
const feedSchema = createSortedSetSchema<{ userId: string }>(
  "feed",
  "user:feed:{userId}",
  3600,
  500, // maxSize
);

// Set for relationships
const followersSchema = createSetSchema<{ userId: string }>(
  "followers",
  "user:followers:{userId}",
  86400,
);

// Counter
const counterSchema = createCounterSchema<{ userId: string; endpoint: string }>(
  "apiCounter",
  "ratelimit:{endpoint}:{userId}",
  60,
);

// HyperLogLog for approximate unique counting (~12KB per key)
const uniqueViewers = createHyperLogLogSchema<{ postId: string }>(
  "unique-viewers",
  "post:{postId}:viewers",
  86400,
);

// Bloom filter for membership testing (no false negatives)
const seenPosts = createBloomFilterSchema<{ userId: string }>(
  "seen-posts",
  "user:{userId}:seen",
  86400,
);
```

## Custom Operations

When built-in operations don't cover your needs, use `addCustomOperation`:

```typescript
import type { CacheOperation } from "cachyer";

const updateIfHigher: CacheOperation<
  { postId: string; score: number },
  number
> = {
  command: "ZADD",
  buildArgs: (params) => [
    `global:trending:posts`,
    "GT", // Only update if new score is greater
    params.score,
    params.postId,
  ],
  parseResult: (result) => result as number,
};

const trendingSchema = createTypedSchema<{}>()
  .name("globalTrending")
  .keyPattern("global:trending:posts")
  .structure("SORTED_SET")
  .ttl(3600)
  .operations((ops) =>
    ops
      .addSortedSetGetRange("getTop", false)
      .addCustomOperation("updateIfHigher", updateIfHigher),
  )
  .build();
```

### CacheOperation Interface

```typescript
interface CacheOperation<TParams, TResult> {
  command: string;
  buildArgs: (params: TParams) => (string | number)[];
  parseResult?: (result: unknown) => TResult;
  description?: string;
}
```

## Registering Schemas

Schemas can optionally be registered with a Cachyer instance for runtime discovery:

```typescript
cache.registerSchema(userProfileSchema);

// Later
const schema = cache.getSchema("userProfile");
const allSchemas = cache.listSchemas();
```

Registration is **not required** for executing operations.

## Available Operation Methods

| Method | Redis Command | Structure |
|--------|---------------|-----------|
| `addGet()` | GET | STRING |
| `addSet()` | SET | STRING |
| `addDelete()` | DEL | Any |
| `addExists()` | EXISTS | Any |
| `addExpire()` | EXPIRE | Any |
| `addTtl()` | TTL | Any |
| `addIncrement()` | INCR | STRING |
| `addDecrement()` | DECR | STRING |
| `addHashGet()` | HGET | HASH |
| `addHashSet()` | HSET | HASH |
| `addHashGetAll()` | HGETALL | HASH |
| `addHashSetMultiple()` | HMSET | HASH |
| `addHashDelete()` | HDEL | HASH |
| `addHashExists()` | HEXISTS | HASH |
| `addHashIncrementBy()` | HINCRBY | HASH |
| `addSortedSetAdd()` | ZADD | SORTED_SET |
| `addSortedSetGetRange()` | ZRANGE/ZREVRANGE | SORTED_SET |
| `addSortedSetRemove()` | ZREM | SORTED_SET |
| `addSortedSetScore()` | ZSCORE | SORTED_SET |
| `addSortedSetCount()` | ZCARD | SORTED_SET |
| `addSortedSetRangeByScore()` | ZRANGEBYSCORE | SORTED_SET |
| `addSetAdd()` | SADD | SET |
| `addSetMembers()` | SMEMBERS | SET |
| `addSetRemove()` | SREM | SET |
| `addSetIsMember()` | SISMEMBER | SET |
| `addSetCount()` | SCARD | SET |
| `addSetGetRandomMember()` | SRANDMEMBER | SET |
| `addHyperLogLogAdd()` | PFADD | STRING |
| `addHyperLogLogCount()` | PFCOUNT | STRING |
| `addHyperLogLogMerge()` | PFMERGE | STRING |
| `addBloomFilterAdd()` | BF.ADD | STRING |
| `addBloomFilterMultiAdd()` | BF.MADD | STRING |
| `addBloomFilterExists()` | BF.EXISTS | STRING |
| `addBloomFilterMultiExists()` | BF.MEXISTS | STRING |
| `addBloomFilterReserve()` | BF.RESERVE | STRING |
| `addCustomOperation()` | Any | Any |
