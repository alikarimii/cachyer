# Adapters

Cachyer uses a pluggable adapter system. Two adapters are built-in:
- **RedisAdapter** — Production use with ioredis
- **MemoryAdapter** — Testing and development (no dependencies)

## Using Redis

```typescript
import Redis from "ioredis";
import { createRedisCachyer } from "cachyer";

const cache = createRedisCachyer({
  keyPrefix: "myapp",
  defaultTtl: 3600,
  connectionOptions: { host: "localhost", port: 6379 },
});
```

Or with an existing ioredis client:

```typescript
import { Cachyer, createRedisAdapter } from "cachyer";

const adapter = createRedisAdapter({ client: new Redis() });
const cache = new Cachyer({ adapter, keyPrefix: "myapp" });
```

### Tree-Shakeable Import

```typescript
import { RedisAdapter, createRedisAdapter } from "cachyer/redis";
```

## Using Memory Adapter

```typescript
import { createMemoryCachyer } from "cachyer";

const cache = createMemoryCachyer({
  keyPrefix: "test",
  maxEntries: 1000,
});
```

### Tree-Shakeable Import

```typescript
import { MemoryAdapter, createMemoryAdapter } from "cachyer/memory";
```

## Creating a Custom Adapter

Implement the `CacheAdapter` interface:

```typescript
import type { CacheAdapter, ConnectionStatus, CacheSetOptions } from "cachyer";

class MongoCacheAdapter implements CacheAdapter {
  readonly name = "mongodb";
  private _status: ConnectionStatus = "disconnected";

  get status() { return this._status; }

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

  async set(key: string, value: string, options?: CacheSetOptions): Promise<string> {
    // Store in MongoDB
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    // Retrieve from MongoDB
    return null;
  }

  // ... implement remaining required methods
}
```

The `CacheAdapter` interface defines ~60+ methods. Core methods (get, set, del, hash ops, sorted set ops) are required. Advanced features (streams, bloom filters, HyperLogLog, pub/sub, scripting) are optional — implement what your backend supports.

See `src/types/adapter.types.ts` for the full interface definition.
