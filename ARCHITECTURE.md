# Cachyer Architecture

## Design Philosophy

Cachyer uses a **layered architecture** to balance ease-of-use with flexibility:

```
┌─────────────────────────────────────┐
│         Your Application            │
│    (Business Logic Layer)           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      Cachyer (Facade Layer)         │
│  - Core operations (get/set/etc)    │
│  - Key prefixing                    │
│  - Metrics & logging                │
│  - Schema support                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    CacheAdapter (Driver Layer)      │
│  - All database operations          │
│  - Advanced features                │
│  - Database-specific logic          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    Backend (Redis/Memory/etc)       │
└─────────────────────────────────────┘
```

## Why Two Layers?

### Problem

If Cachyer exposes every adapter method as its own method, we have issues:

1. **Code duplication** - 50+ methods just proxying to adapter
2. **Key prefixing complexity** - Which methods need prefixing? How many keys?
3. **Maintenance burden** - Every new adapter method needs a Cachyer wrapper
4. **No clear separation** - What's the difference between Cachyer and adapter?

### Solution

**Expose the adapter directly** via a public getter:

```typescript
const cache = new Cachyer({ adapter: redisAdapter })

// Core operations: Use Cachyer (key prefixing applied)
await cache.get('user:123')           // → 'myapp:user:123'
await cache.set('user:123', data)     // → 'myapp:user:123'
await cache.zadd('leaderboard', [...]) // → 'myapp:leaderboard'

// Advanced features: Use adapter (NO key prefixing)
await cache.adapter.xadd('logs', '*', { msg: 'hello' })
await cache.adapter.bfAdd('bloom:users', 'user123')
await cache.adapter.pfadd('hyperlog:visitors', 'ip1', 'ip2')
```

## Cachyer vs Adapter: When to Use What?

### Use Cachyer for:

✅ **Common operations** everyone needs

- Get/Set/Delete
- Hashes (user profiles, settings)
- Sorted Sets (leaderboards, feeds)
- Sets (followers, tags)
- Lists (queues, recent items)
- Expire/TTL management

✅ **When you need:**

- Automatic key prefixing
- Metrics collection
- Schema validation
- Centralized logging

### Use Adapter for:

✅ **Advanced/specialized features**

- Redis Streams (event sourcing, logs)
- Bloom Filters (membership tests)
- HyperLogLog (cardinality estimates)
- Geo commands (location queries)
- Pub/Sub (real-time messaging)

✅ **When you need:**

- Full control over keys
- Database-specific features
- Performance-critical paths
- Direct database access

## Key Prefixing

**Important:** Adapter methods do NOT apply key prefixing.

If you need prefixed keys with adapter methods:

```typescript
// Option 1: Manual prefixing
const prefix = "myapp";
await cache.adapter.xadd(`${prefix}:logs`, "*", data);

// Option 2: Use Cachyer's prefixing (if exposed)
// Note: Currently private, could be exposed if needed
const key = cache.prefixKey("logs");
await cache.adapter.xadd(key, "*", data);
```

## Examples

### Social Media Platform

```typescript
import { Cachyer } from "cachyer";
import { RedisAdapter } from "cachyer/adapters/redis";

class SocialMediaCache {
  private cache: Cachyer;

  constructor(redisAdapter: RedisAdapter) {
    this.cache = new Cachyer({
      adapter: redisAdapter,
      keyPrefix: "social",
    });
  }

  // Core operations: Use Cachyer
  async getUserProfile(userId: string) {
    return this.cache.get(`user:${userId}:profile`);
  }

  async addToFeed(userId: string, postId: string, score: number) {
    return this.cache.zadd(`feed:${userId}:home`, [{ member: postId, score }]);
  }

  // Advanced features: Use adapter
  async addActivityToStream(userId: string, activity: object) {
    // Direct adapter access for streams
    return this.cache.adapter.xadd(
      `social:activity:${userId}`, // Manual prefixing
      "*",
      activity
    );
  }

  async checkUserExists(userId: string) {
    // Bloom filter for efficient existence checks
    return this.cache.adapter.bfExists("social:bloom:users", userId);
  }
}
```

### E-commerce Platform

```typescript
class EcommerceCache {
  private cache: Cachyer;

  // Core operations
  async getProduct(id: string) {
    return this.cache.get(`product:${id}`);
  }

  async getCart(userId: string) {
    return this.cache.hgetall(`cart:${userId}`);
  }

  // Advanced: Real-time inventory updates via streams
  async publishInventoryUpdate(productId: string, quantity: number) {
    return this.cache.adapter.xadd("ecom:inventory:updates", "*", {
      productId,
      quantity,
      timestamp: Date.now(),
    });
  }

  // Advanced: HyperLogLog for unique visitor counts
  async trackUniqueVisitor(visitorId: string) {
    return this.cache.adapter.pfadd("ecom:visitors:daily", visitorId);
  }

  async getUniqueVisitorCount() {
    return this.cache.adapter.pfcount("ecom:visitors:daily");
  }
}
```

## Adapter Implementation Guidelines

When implementing a new adapter (e.g., MongoDB, PostgreSQL):

### Required Methods

Must implement these core operations:

- `get`, `set`, `del`, `exists`
- `hget`, `hset`, `hgetall`
- `zadd`, `zrange`, `zrevrange`
- `sadd`, `smembers`
- `lpush`, `lrange`
- `incr`, `expire`, `ttl`
- Connection methods: `connect`, `disconnect`, `isConnected`, `ping`

### Optional Methods

Implement if the backend supports them:

- **Streams**: `xadd`, `xread`, `xrange`, `xrevrange`, `xlen`, `xtrim`, `xdel`
- **Bloom Filters**: `bfReserve`, `bfAdd`, `bfMAdd`, `bfExists`, `bfMExists`
- **HyperLogLog**: `pfadd`, `pfcount`, `pfmerge`
- **Geo**: `geoadd`, `geodist`, `georadius`
- **Pub/Sub**: `publish`, `subscribe`
- **Scripting**: `executeScript`, `loadScript`
- **Transactions**: `executePipeline`, `executeTransaction`

Use capability detection:

```typescript
const capabilities = cache.getCapabilities()
if (capabilities.streams) {
  await cache.adapter.xadd(...)
}
```

## Benefits of This Architecture

1. **✅ Simplicity** - Cachyer has a clean, focused API
2. **✅ Flexibility** - Direct adapter access for advanced needs
3. **✅ Maintainability** - No need to wrap every adapter method
4. **✅ Performance** - No extra layer for advanced operations
5. **✅ Extensibility** - New adapter features don't break Cachyer
6. **✅ Clear contracts** - Each layer has a clear purpose

## Migration from Private Adapter

If you had code that accessed the private adapter:

### Before (Hacky)

```typescript
const adapter = (cache as any).adapter
await adapter.xadd(...)
```

### After (Clean)

```typescript
await cache.adapter.xadd(...)
```

## Future Considerations

### Possible Enhancements

1. **Expose prefixKey()** - Allow manual key prefixing for adapter methods
2. **Adapter proxy** - Optionally auto-prefix all adapter operations
3. **Namespace contexts** - Multiple prefixes in same cache instance
4. **Typed operations** - Type-safe operations based on key patterns

### Not Planned

- ❌ Wrapping all adapter methods in Cachyer (defeats the purpose)
- ❌ Automatic key prefixing for adapter (explicit is better)
- ❌ Hiding the adapter (reduces flexibility)
